import { useCallback, useEffect, useState } from 'react';
import { DAILY_TYPES, PUZZLE_META, dailyRef, periodRef, refId, type PuzzleRef } from '@puzzle-hustle/core';
import { ApiError, apiFetch, readSession } from '../lib/api.ts';
import { useSession } from '../lib/auth.ts';
import { joinUrl, share } from '../lib/share.ts';
import { SubpageHead } from '../components/SubpageHead.tsx';
import { toast } from '../components/Toast.tsx';
import { Board } from '../components/Board.tsx';
import { GroupMenu } from '../components/GroupMenu.tsx';
import { pushBackGuard } from '../lib/back.ts';
import { StandingsCarousel } from '../components/StandingsCarousel.tsx';
import { dailyNumber, monthlyNumber, weeklyNumber } from '../lib/stats.ts';

export interface Group {
  id: string;
  code: string;
  name: string;
  members: number;
  owner: boolean;
}

export function useGroups(): { groups: Group[]; reload: () => void; loading: boolean; failed: boolean } {
  const session = useSession();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(() => {
    if (!session) {
      setGroups([]);
      setFailed(false);
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
        if (readSession()?.token !== session.token) return;
        setGroups(data.groups);
        setFailed(false);
      })
      // The last list stays; the page says it could not be loaded instead of going quiet.
      .catch(() => {
        if (readSession()?.token === session.token) setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(reload, [reload]);
  // Coming back online is the moment a failed load can work.
  useEffect(() => {
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, [reload]);
  return { groups, reload, loading, failed };
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

function socialPuzzles() {
  return [...DAILY_TYPES.map((type) => dailyRef(type)), periodRef('weekly'), periodRef('monthly')];
}

export function pageLabel(ref: PuzzleRef): string {
  const name = PUZZLE_META[ref.type].name;
  if (ref.period === 'weekly') return `Weekly #${weeklyNumber(ref.key!)} · ${name}`;
  if (ref.period === 'monthly') return `Monthly #${monthlyNumber(ref.key!)} · ${name}`;
  return `${name} · Daily #${dailyNumber(ref.key!)}`;
}

type Dialog = 'new' | 'join' | 'leave' | null;

// Groups and standings, a page under Profile. Only with a session: without an account there is
// nothing here, and a player who just wants to solve never sees times to compare. The standings
// are the last thing on the page, so a card of another height never moves anything below it;
// group actions live in the group menu (2026-10-02). Without a group the create and join cards
// stand in their place. An invitation link (/join?c=CODE) opens the join dialog prefilled; the
// placement chip after a solve (/social?g=GROUP&p=PUZZLE) opens those standings.
export function Social({ code: initialCode = '', group = null, puzzle: initialPuzzle = null }: { code?: string; group?: string | null; puzzle?: string | null } = {}) {
  const session = useSession();
  const { groups, reload, loading, failed } = useGroups();
  const [name, setName] = useState('');
  const [code, setCode] = useState(normalizeCode(initialCode).slice(0, 6));
  // Independent per-form flags, not useGroups's loading: that one is about the list refetch.
  // These exist only to stop a double-tap on a pill button from firing a second POST before
  // the first one has come back.
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(group);
  const [puzzleIndex, setPuzzleIndex] = useState(() => Math.max(0, socialPuzzles().findIndex((ref) => refId(ref) === initialPuzzle)));
  const [dialog, setDialog] = useState<Dialog>(initialCode ? 'join' : null);

  useEffect(() => {
    if (!dialog) return;
    return pushBackGuard(() => {
      setDialog(null);
      return true;
    });
  }, [dialog]);

  if (!session) return null;

  if (loading && groups.length === 0) {
    return (
      <>
        <SubpageHead title="Social" />
        <p className="muted small">Loading…</p>
      </>
    );
  }

  // Nine generator runs a signed-out (or still-loading) player never needs, so this stays below
  // both early returns above and only runs once we know it will actually be rendered.
  const puzzles = socialPuzzles();

  const create = async () => {
    setCreating(true);
    try {
      const created = await apiFetch<Group>('/groups', { method: 'POST', body: JSON.stringify({ name }), auth: true });
      setName('');
      setDialog(null);
      setGroupId(created.id);
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
      const joined = await apiFetch<Group>('/groups/join', { method: 'POST', body: JSON.stringify({ code }), auth: true });
      setCode('');
      setDialog(null);
      setGroupId(joined.id);
      reload();
      toast(`Joined ${joined.name}`);
    } catch (err) {
      toast(explain(err));
    } finally {
      setJoining(false);
    }
  };

  const leave = async (group: Group) => {
    setDialog(null);
    try {
      await apiFetch('/groups/leave', { method: 'POST', body: JSON.stringify({ id: group.id }), auth: true });
      setGroupId(null);
      reload();
    } catch (err) {
      toast(explain(err));
    }
  };

  const invite = (group: Group) =>
    void share(`Join my Puzzle Hustle group "${group.name}"\nCode ${group.code}\n${joinUrl(group.code)}`).then((outcome) => {
      if (outcome === 'copied') toast('Link copied');
      else if (outcome === 'failed') toast('Could not share');
    });

  const current = activeGroup(groups, groupId);
  const active = current?.id ?? null;
  const pages = puzzles.map((ref) => ({ key: refId(ref), label: pageLabel(ref), color: `var(--type-${ref.type})` }));

  const nameInput = <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Group name" aria-label="Group name" />;
  const createButton = (
    <button type="button" className="pill" onClick={() => void create()} disabled={name.trim().length < 2 || creating}>
      Create
    </button>
  );
  const codeInput = (
    <input value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} maxLength={6} placeholder="CODE" aria-label="Group code" className="num" />
  );
  const joinButton = (
    <button type="button" className="pill" onClick={() => void join()} disabled={code.length !== 6 || joining}>
      Join
    </button>
  );

  return (
    <>
      <SubpageHead title="Social" />
      <div className="stack">
        {failed && (
          <section className="card-lg friends-failed" role="alert">
            <span className="muted small">Your groups could not be loaded. Check your connection.</span>
            <button type="button" className="pill" onClick={reload} disabled={loading}>
              Retry
            </button>
          </section>
        )}
        {active && current ? (
          <section className="standings" aria-label="Standings">
            <div className="standings-top">
              <h2>Standings</h2>
              <GroupMenu
                groups={groups}
                active={active}
                onPick={setGroupId}
                onAction={(action) => (action === 'invite' ? invite(current) : setDialog(action))}
              />
            </div>
            <StandingsCarousel
              pages={pages}
              index={puzzleIndex}
              onIndex={setPuzzleIndex}
              render={(page) => (
                <Board
                  groupId={active}
                  puzzle={page.key}
                  meId={session.player.id}
                  owner={current.owner}
                  onRemoved={reload}
                  title={page.label}
                />
              )}
            />
          </section>
        ) : (
          !failed && (
            <div className="card-row">
              <section className="card-lg">
                <h2>New group</h2>
                <div className="friends-actions stacked">
                  {nameInput}
                  {createButton}
                </div>
              </section>
              <section className="card-lg">
                <h2>Join a group</h2>
                <div className="friends-actions stacked">
                  {codeInput}
                  {joinButton}
                </div>
              </section>
            </div>
          )
        )}
      </div>
      {current && dialog && (
        <div
          className="ad-ask"
          role="dialog"
          aria-modal="true"
          aria-label={dialog === 'new' ? 'New group' : dialog === 'join' ? 'Join a group' : 'Leave group'}
          onClick={(e) => e.target === e.currentTarget && setDialog(null)}
        >
          <div className="card-lg">
            {dialog === 'new' && (
              <>
                <b>New group</b>
                <div className="friends-actions stacked">{nameInput}</div>
              </>
            )}
            {dialog === 'join' && (
              <>
                <b>Join a group</b>
                <div className="friends-actions stacked">{codeInput}</div>
              </>
            )}
            {dialog === 'leave' && (
              <>
                <b>{current.members === 1 ? `Delete ${current.name}?` : `Leave ${current.name}?`}</b>
                <span className="muted small">
                  {current.members === 1 ? 'You are the last member, so the group and its standings go away.' : 'You can come back any time with the code.'}
                </span>
              </>
            )}
            <div className="ad-ask-row">
              <button type="button" className="pill outline" onClick={() => setDialog(null)}>
                {dialog === 'leave' ? 'Not now' : 'Cancel'}
              </button>
              {dialog === 'new' && createButton}
              {dialog === 'join' && joinButton}
              {dialog === 'leave' && (
                <button type="button" className="pill danger" onClick={() => void leave(current)}>
                  {current.members === 1 ? 'Delete' : 'Leave'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
