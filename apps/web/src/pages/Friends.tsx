import { useCallback, useEffect, useState } from 'react';
import { DAILY_TYPES, PUZZLE_META, dailyRef, periodRef, refId } from '@puzzle-hustle/core';
import { ApiError, apiFetch, readSession } from '../lib/api.ts';
import { useSession } from '../lib/auth.ts';
import { capitalize, joinUrl, share } from '../lib/share.ts';
import { toast } from '../components/Toast.tsx';
import { Board } from '../components/Board.tsx';
import { CoinPill } from '../components/CoinPill.tsx';

export interface Group {
  id: string;
  code: string;
  name: string;
  members: number;
  owner: boolean;
}

export function useGroups(): { groups: Group[]; reload: () => void; loading: boolean } {
  const session = useSession();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (!session) {
      setGroups([]);
      return;
    }
    setLoading(true);
    apiFetch<{ groups: Group[] }>('/groups', { auth: true })
      // A sign-out (or account switch) while this request is in flight must not let a late
      // response repopulate a list for a session that is no longer current.
      .then((data) => {
        // apiFetch only guarantees parseable JSON, not this shape. Treat a malformed body
        // exactly like any other failed request rather than handing a non-array to setGroups
        // and blanking the Daily tab's FriendsRow, or anything else that maps over it.
        if (!Array.isArray(data.groups)) throw new Error('malformed /groups response');
        if (readSession()?.token === session.token) setGroups(data.groups);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(reload, [reload]);
  return { groups, reload, loading };
}

const MESSAGES: Record<string, string> = {
  group_unknown: 'No group with that code',
  group_already: 'You are already in that group',
  group_full: 'That group is full',
  group_limit: 'You are in five groups already',
  group_name: 'Pick a different name',
  group_banned: 'The owner removed you from that group',
  too_many_requests: 'Too many tries, wait a minute',
  offline: 'No connection',
  unauthorized: 'Please sign in again',
};

export function explain(err: unknown): string {
  return err instanceof ApiError ? (MESSAGES[err.code] ?? 'Something went wrong') : 'Something went wrong';
}

// Crockford decoding, as on the server: a typed O means 0, an I or L means 1.
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
}

// The selected group can vanish from the list (left, removed, deleted); fall back to the first.
export function activeGroup(groups: Group[], selected: string | null): Group | null {
  return groups.find((g) => g.id === selected) ?? groups[0] ?? null;
}

// How long an armed Leave stays armed, as for Reset on Profile.
const CONFIRM_MS = 2000;

export function Friends({ code: initialCode = '' }: { code?: string } = {}) {
  const session = useSession();
  const { groups, reload, loading } = useGroups();
  const [name, setName] = useState('');
  const [code, setCode] = useState(normalizeCode(initialCode).slice(0, 6));
  // Independent per-form flags, not useGroups's loading: that one is about the list refetch.
  // These exist only to stop a double-tap on a pill button from firing a second POST before
  // the first one has come back.
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [leaving, setLeaving] = useState<string | null>(null);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  // App sends a signed-out player to Profile instead; this only covers the render before it does.
  if (!session) return null;

  if (loading && groups.length === 0) {
    return (
      <>
        <section className="page-head">
          <h1>Social</h1>
          <CoinPill />
        </section>
        <p className="muted small">Loading…</p>
      </>
    );
  }

  // Nine generator runs a signed-out (or still-loading) player never needs, so this stays below
  // both early returns above and only runs once we know it will actually be rendered.
  const puzzles = [...DAILY_TYPES.map((type) => dailyRef(type)), periodRef('weekly'), periodRef('monthly')];

  const create = async () => {
    setCreating(true);
    try {
      await apiFetch<Group>('/groups', { method: 'POST', body: JSON.stringify({ name }), auth: true });
      setName('');
      reload();
    } catch (err) {
      toast(explain(err));
    } finally {
      setCreating(false);
    }
  };

  const join = async () => {
    setJoining(true);
    try {
      const group = await apiFetch<Group>('/groups/join', { method: 'POST', body: JSON.stringify({ code }), auth: true });
      setCode('');
      reload();
      toast(`Joined ${group.name}`);
    } catch (err) {
      toast(explain(err));
    } finally {
      setJoining(false);
    }
  };

  const leave = async (group: Group) => {
    setLeaving(null);
    try {
      await apiFetch('/groups/leave', { method: 'POST', body: JSON.stringify({ id: group.id }), auth: true });
      reload();
    } catch (err) {
      toast(explain(err));
    }
  };

  const current = activeGroup(groups, groupId);
  const active = current?.id ?? null;
  const puzzle = puzzles[puzzleIndex]!;

  return (
    <>
      <section className="page-head">
        <h1>Social</h1>
        <CoinPill />
      </section>

      <div className="stack">
        <div className="card-row">
          <section className="card-lg">
            <h2>New group</h2>
            <div className="friends-actions stacked">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Group name" />
              <button type="button" className="pill" onClick={() => void create()} disabled={name.trim().length < 2 || creating}>
                Create
              </button>
            </div>
          </section>

          <section className="card-lg">
            <h2>Join a group</h2>
            <div className="friends-actions stacked">
              <input
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                maxLength={6}
                placeholder="CODE"
                className="num"
              />
              <button type="button" className="pill" onClick={() => void join()} disabled={code.length !== 6 || joining}>
                Join
              </button>
            </div>
          </section>
        </div>

        {active && (
          <section className="card-lg">
            <h2>Standings</h2>
            {groups.length > 1 && (
              <div className="pill-row">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={group.id === active ? 'pill' : 'pill outline'}
                    onClick={() => setGroupId(group.id)}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            )}
            <div className="pill-row">
              {puzzles.map((ref, index) => (
                <button
                  key={refId(ref)}
                  type="button"
                  className={index === puzzleIndex ? 'pill' : 'pill outline'}
                  onClick={() => setPuzzleIndex(index)}
                >
                  {ref.period === 'daily' ? PUZZLE_META[ref.type].name : capitalize(ref.period!)}
                </button>
              ))}
            </div>
            <Board
              groupId={active}
              puzzle={refId(puzzle)}
              meId={session.player.id}
              owner={current?.owner ?? false}
              onRemoved={reload}
            />
          </section>
        )}

        {groups.map((group) => (
          <div key={group.id} className="row-card friends-row">
            <span className="row-text">
              <span className="row-title">{group.name}</span>
              <span className="row-sub">
                {group.members} member{group.members === 1 ? '' : 's'} · code <b className="num">{group.code}</b>
              </span>
            </span>
            <span className="friends-row-actions">
              <button
                type="button"
                className="pill outline"
                onClick={() =>
                  void share(`Join my Puzzle Hustle group "${group.name}"\nCode ${group.code}\n${joinUrl(group.code)}`).then(
                    (outcome) => {
                      if (outcome === 'copied') toast('Link copied');
                      else if (outcome === 'failed') toast('Could not share');
                    },
                  )
                }
              >
                Invite
              </button>
              {leaving === group.id ? (
                <button type="button" className="pill danger" onClick={() => void leave(group)}>
                  {group.members === 1 ? 'Delete group' : 'Leave'}
                </button>
              ) : (
                <button type="button" className="pill outline" onClick={() => setLeaving(group.id)}>
                  Leave
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
