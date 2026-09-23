import { useCallback, useEffect, useRef, useState } from 'react';
import { DAILY_TYPES, PUZZLE_META, dailyRef, periodRef, refId } from '@puzzle-hustle/core';
import { ApiError, apiFetch, readSession } from '../lib/api.ts';
import {
  NATIVE_GOOGLE,
  SIGN_IN_AVAILABLE,
  deleteAccount,
  nativeSignIn,
  renderSignInButton,
  signOut,
  useSession,
} from '../lib/auth.ts';
import { href, onLinkClick } from '../lib/router.ts';
import { capitalize, joinUrl, share } from '../lib/share.ts';
import { toast } from '../components/Toast.tsx';
import { Board } from '../components/Board.tsx';
import { CoinPill } from '../components/CoinPill.tsx';
import { useTheme } from '../lib/theme.ts';

// How long the delete button stays armed before it falls back to asking again.
const DELETE_CONFIRM_MS = 4000;

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
  offline: 'No connection',
  unauthorized: 'Please sign in again',
};

export function explain(err: unknown): string {
  return err instanceof ApiError ? (MESSAGES[err.code] ?? 'Something went wrong') : 'Something went wrong';
}

export function Friends({ code: initialCode = '' }: { code?: string } = {}) {
  const session = useSession();
  const { groups, reload, loading } = useGroups();
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode.trim().toUpperCase().slice(0, 6));
  // Independent per-form flags, not useGroups's loading: that one is about the list refetch.
  // These exist only to stop a double-tap on a pill button from firing a second POST before
  // the first one has come back.
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [puzzleIndex, setPuzzleIndex] = useState(0);

  if (!session) {
    return (
      <>
        <section className="page-head">
          <h1>Social</h1>
          <CoinPill />
        </section>
        <AccountCard />
      </>
    );
  }

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
    try {
      await apiFetch('/groups/leave', { method: 'POST', body: JSON.stringify({ id: group.id }), auth: true });
      reload();
    } catch (err) {
      toast(explain(err));
    }
  };

  const active = groupId ?? groups[0]?.id ?? null;
  const puzzle = puzzles[puzzleIndex]!;

  return (
    <>
      <section className="page-head">
        <h1>Social</h1>
        <CoinPill />
      </section>

      <div className="stack">
        <AccountCard />

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
                onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
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
            <Board groupId={active} puzzle={refId(puzzle)} meId={session.player.id} />
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
              <button type="button" className="pill outline" onClick={() => void leave(group)}>
                Leave
              </button>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function AccountCard() {
  const session = useSession();
  const { theme } = useTheme();
  const buttonHost = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Google's button is an iframe from accounts.google.com, and for an account that already
  // consented it serves a white personalised variant regardless of the theme and shape asked
  // for in the iframe's own URL. Nothing on our side can colour it. So it is not shown until
  // the player asks for it: at rest the card carries an ordinary app button, and Google's
  // control appears when it is the thing being looked at rather than a bright slab sitting in
  // a dark card. Ours says only "Sign in" — the Google wording and mark belong on Google's.
  const [asked, setAsked] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const attemptSignIn = () => {
    if (!buttonHost.current) return;
    setFailed(false);
    renderSignInButton(buttonHost.current, () => setFailed(false), theme).catch(() => setFailed(true));
  };

  useEffect(() => {
    // Keyed on the theme as well: Google draws the button itself, so the only way it follows
    // a theme switch is to draw it again. Android has no widget to draw, its sheet is native.
    if (asked && !session && !NATIVE_GOOGLE) attemptSignIn();
  }, [session, theme, asked]);

  // Mirrors ResetButton.tsx's arm/revert pattern: the timer lives in an effect keyed on the
  // armed state so it is cleared on unmount or re-arm instead of firing into a stale closure.
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), DELETE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  if (!session) {
    if (!SIGN_IN_AVAILABLE) {
      return (
        <div className="card-lg">
          <h2>Account</h2>
          <span className="muted small">Sign-in isn't set up on this build yet. Everything else works without an account.</span>
          <div className="friends-actions">
            <a href={href('/shop')} className="pill outline" onClick={onLinkClick}>
              Customize
            </a>
          </div>
        </div>
      );
    }
    return (
      <div className="card-lg">
        <h2>Account</h2>
        <span className="muted small">Sign in to compare your daily times with a group of friends. Everything else works without an account.</span>
        {!asked && (
          // In the same wrapper the signed-in actions use: the card is a flex column, so a
          // bare button stretches the full width and reads as a bar rather than a button.
          <div className="friends-actions">
            {NATIVE_GOOGLE ? (
              <button
                type="button"
                className="pill"
                disabled={signingIn}
                onClick={() => {
                  setSigningIn(true);
                  void nativeSignIn().finally(() => setSigningIn(false));
                }}
              >
                Sign in with Google
              </button>
            ) : (
              <button type="button" className="pill" onClick={() => setAsked(true)}>
                Sign in
              </button>
            )}
          </div>
        )}
        {asked && <div className="gsi-host" ref={buttonHost} />}
        {failed && (
          <button type="button" className="linklike muted small" onClick={attemptSignIn}>
            Sign-in is unavailable right now. Try again.
          </button>
        )}
        <div className="friends-actions">
          <a href={href('/shop')} className="pill outline" onClick={onLinkClick}>
            Customize
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="card-lg">
      <h2>Friends</h2>
      <span className="muted small">Signed in as {session.player.name}.</span>
      <div className="friends-actions">
        <a href={href('/shop')} className="pill outline" onClick={onLinkClick}>
          Customize
        </a>
        <button type="button" className="pill outline" onClick={signOut}>
          Sign out
        </button>
        <button
          type="button"
          className={confirmDelete ? 'pill danger' : 'pill outline'}
          onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              return;
            }
            setConfirmDelete(false);
            void deleteAccount();
          }}
        >
          {confirmDelete ? 'Sure?' : 'Delete account'}
        </button>
      </div>
    </div>
  );
}
