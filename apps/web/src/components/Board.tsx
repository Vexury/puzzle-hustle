import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { badgeRarity, findCosmetic, parsePuzzleId, SHOWCASE_SIZE, type Cosmetic, type Period } from '@puzzle-hustle/core';
import { apiFetch } from '../lib/api.ts';
import { formatSeconds, ordinal } from '../lib/share.ts';
import { readSetting, writeSetting } from '../lib/storage.ts';
import { BadgeIcon } from './BadgeIcon.tsx';
import { NameplateArt, plateClass } from './Nameplate.tsx';
import { toast } from './Toast.tsx';
import { ToolGlyph } from './ToolButton.tsx';

export interface BoardData {
  entries: Array<{ playerId: string; name: string; seconds: number; hints: number; badge?: string | null; badges?: string[] | null; flair?: string | null; nameplate?: string | null; hustle?: number }>;
  // Members without a time, by name; missing from a server before 2026-10-03.
  open?: Array<{ playerId: string; name: string; hustle?: number }>;
  me: number | null;
  percentile: { total: number; faster: number } | null;
}

export function useBoard(
  groupId: string | null,
  puzzle: string,
): { board: BoardData | null; loading: boolean; reload: () => void } {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  // Holds the groupId|puzzle of whichever request is the latest. Tapping through the pill
  // row fires overlapping requests; an earlier, slower one must not overwrite the board with
  // another puzzle's times just because it resolves last.
  const current = useRef<string | null>(null);
  useEffect(() => {
    const key = groupId ? `${groupId}|${puzzle}` : null;
    current.current = key;
    if (!groupId) {
      setBoard(null);
      return;
    }
    setLoading(true);
    apiFetch<BoardData>(`/board?group=${encodeURIComponent(groupId)}&puzzle=${encodeURIComponent(puzzle)}`, { auth: true })
      .then((data) => {
        if (current.current === key) setBoard(data);
      })
      .catch(() => {
        if (current.current === key) setBoard(null);
      })
      .finally(() => {
        if (current.current === key) setLoading(false);
      });
  }, [groupId, puzzle, version]);
  return { board, loading, reload: () => setVersion((v) => v + 1) };
}

// Players this device chose not to see, on every board. Local only: nobody is told.
const HIDDEN_KEY = 'ph:hidden';

export function readHidden(): string[] {
  try {
    const parsed = JSON.parse(readSetting(HIDDEN_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function writeHidden(ids: string[]) {
  writeSetting(HIDDEN_KEY, JSON.stringify([...new Set(ids)]));
}

export function splitHidden<T extends { playerId: string }>(
  entries: T[],
  hidden: string[],
  meId: string,
): { shown: Array<T & { rank: number }>; hidden: T[] } {
  const set = new Set(hidden);
  const isHidden = (entry: T) => entry.playerId !== meId && set.has(entry.playerId);
  // Rank stays the place on the full board, so hiding someone never moves the others up.
  return {
    shown: entries.flatMap((e, index) => (isHidden(e) ? [] : [{ ...e, rank: index + 1 }])),
    hidden: entries.filter(isHidden),
  };
}

// How long an armed Remove stays armed, as for Reset on Profile.
const CONFIRM_MS = 2000;

// "Beat N%" compares against everybody else who solved this puzzle, so the player
// themselves is out of both sides of the fraction. Below 20 submissions the number says
// more about the size of the field than about the player, so it stays hidden.
export function percentileText(percentile: BoardData['percentile'], period: Period): string | null {
  if (!percentile || percentile.total < 20) return null;
  const others = percentile.total - 1;
  const beaten = others - percentile.faster;
  const when = period === 'weekly' ? 'this week' : period === 'monthly' ? 'this month' : 'today';
  return `beat ${Math.round((beaten / others) * 100)}% of players ${when}`;
}

const MEDALS = ['gold', 'silver', 'bronze'] as const;

function Crown() {
  return (
    <svg className="leaderboard-crown" viewBox="0 0 24 16" aria-hidden="true">
      <path d="M2 14 L4 4 L9 9 L12 2 L15 9 L20 4 L22 14 Z" />
    </svg>
  );
}

// An id this client does not know comes from a newer one: hidden, never an error.
export function rowCosmetics(entry: { badge?: string | null; flair?: string | null }): {
  badge: Cosmetic | undefined;
  flair: Cosmetic | undefined;
} {
  const badge = findCosmetic(entry.badge);
  const flair = findCosmetic(entry.flair);
  return { badge: badge?.kind === 'badge' ? badge : undefined, flair: flair?.kind === 'flair' ? flair : undefined };
}

// The showcase, tinted by rarity. A row from a server before the showcase has only `badge`;
// ids this client does not know are left out.
export function showcaseOf(entry: { badge?: string | null; badges?: string[] | null }): Cosmetic[] {
  const ids = entry.badges ?? (entry.badge ? [entry.badge] : []);
  return ids.flatMap((id) => {
    const item = findCosmetic(id);
    return item?.kind === 'badge' ? [item] : [];
  }).slice(0, SHOWCASE_SIZE);
}

export function NameCell({ entry, wave = 0 }: { entry: { name: string; badge?: string | null; badges?: string[] | null; flair?: string | null; hustle?: number | undefined }; wave?: number }) {
  const { flair } = rowCosmetics(entry);
  const badges = showcaseOf(entry);
  return (
    <span className="leaderboard-who">
      <span className="leaderboard-name">
        <span className="leaderboard-name-text np-name">{entry.name}</span>
        {entry.hustle ? <span className="hustle-chip">Lv {entry.hustle}</span> : null}
      </span>
      {(badges.length > 0 || flair) && (
        <span className="leaderboard-sub">
          {badges.length > 0 && (
            <span className="row-badges">
              {badges.map((b, i) => (
                <span key={b.id} className={`rarity-${badgeRarity(b as Extract<Cosmetic, { kind: 'badge' }>)}`} title={b.title}>
                  <BadgeIcon id={b.id} className="row-badge" wave={wave + i * 0.08} />
                </span>
              ))}
            </span>
          )}
          {flair && <span className="leaderboard-flair">{flair.title}</span>}
        </span>
      )}
    </span>
  );
}

type RowEntry = { name: string; seconds: number; hints: number; badge?: string | null; badges?: string[] | null; flair?: string | null; nameplate?: string | null; hustle?: number | undefined };

// One standings row: medal or place, the name with its level, below it the showcase and the
// flair, then hints and the time; the player's nameplate behind it all. Since 2026-10-02 the
// showcase sits on the second line so the name keeps its width. The shop shows the same row as
// its preview. `children` is an overlay the row hands its taps to (Board's row actions).
export function StandingsRow({ entry, rank, me, wave = 0, children }: { entry: RowEntry; rank: number; me: boolean; wave?: number; children?: ReactNode }) {
  return (
    <li className={`leaderboard-row${rank <= 3 ? ` podium ${MEDALS[rank - 1]}` : ''}${me ? ' me' : ''}${plateClass(entry.nameplate)}`}>
      <NameplateArt id={entry.nameplate} />
      <span className="leaderboard-rank">
        {rank === 1 && <Crown />}
        {rank}
      </span>
      <NameCell entry={entry} wave={wave} />
      {entry.hints > 0 && (
        <span className="leaderboard-hints" role="img" aria-label={`${entry.hints} hint${entry.hints === 1 ? '' : 's'}`}>
          <ToolGlyph icon="hint" />
          {entry.hints}
        </span>
      )}
      <span className="leaderboard-time">{formatSeconds(entry.seconds)}</span>
      {children}
    </li>
  );
}

// A member who has not solved this puzzle yet: name and level, no plate, no showcase, so the
// standings above stay the thing to look at (2026-10-03).
export function OpenRow({ name, hustle, me, children }: { name: string; hustle?: number | undefined; me: boolean; children?: ReactNode }) {
  return (
    <li className={`leaderboard-row open${me ? ' me' : ''}`}>
      <span className="leaderboard-rank" />
      <span className="leaderboard-who">
        <span className="leaderboard-name">
          <span className="leaderboard-name-text">{name}</span>
          {hustle ? <span className="hustle-chip">Lv {hustle}</span> : null}
        </span>
      </span>
      <span className="leaderboard-time">–</span>
      {children}
    </li>
  );
}

export function Board({
  groupId,
  puzzle,
  meId,
  owner = false,
  onRemoved,
  title,
}: {
  groupId: string;
  puzzle: string;
  meId: string;
  owner?: boolean;
  onRemoved?: () => void;
  title?: string;
}) {
  const { board, loading, reload } = useBoard(groupId, puzzle);
  const [hiddenIds, setHiddenIds] = useState(readHidden);
  const [open, setOpen] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  // Both head lines always stand, the percentile included, so every card of a group is as tall
  // as its member count makes it and swiping never changes the height (2026-10-03).
  const solved = board?.entries.length ?? 0;
  const percentile = board && percentileText(board.percentile, parsePuzzleId(puzzle)?.period ?? 'daily');
  const status = !board
    ? ' '
    : board.me
      ? `you ${ordinal(board.me)} of ${solved}${percentile ? ` · ${percentile}` : ''}`
      : `${solved} of ${solved + (board.open?.length ?? 0)} solved`;
  const head = title && (
    <div className="standings-head">
      <b>{title}</b>
      <span className="muted small">{status}</span>
    </div>
  );
  if (loading && !board) return <>{head}<p className="muted small">Loading…</p></>;
  if (!board) return <>{head}<p className="muted small">Standings are unavailable right now.</p></>;
  const { shown, hidden } = splitHidden(board.entries, hiddenIds, meId);
  const unsolved = splitHidden(board.open ?? [], hiddenIds, meId);
  const hiddenAll = [...hidden, ...unsolved.hidden];
  if (shown.length === 0 && unsolved.shown.length === 0 && hiddenAll.length === 0) {
    return <>{head}<p className="muted small">Nobody in this group has solved it yet.</p></>;
  }

  const updateHidden = (ids: string[]) => {
    writeHidden(ids);
    setHiddenIds(readHidden());
  };

  type Member = { playerId: string; name: string };

  const report = (entry: Member) =>
    void apiFetch('/report', {
      method: 'POST',
      body: JSON.stringify({ playerId: entry.playerId, reason: 'name' }),
      auth: true,
    })
      .then(() => toast('Reported'))
      .catch(() => toast('Could not report'));

  const remove = (entry: Member) =>
    void apiFetch('/groups/remove', {
      method: 'POST',
      body: JSON.stringify({ id: groupId, playerId: entry.playerId }),
      auth: true,
    })
      .then(() => {
        toast(`Removed ${entry.name}`);
        setOpen(null);
        reload();
        onRemoved?.();
      })
      .catch(() => toast('Could not remove'));

  const hitButton = (entry: Member) =>
    entry.playerId !== meId && (
      <button
        type="button"
        className="leaderboard-hit"
        aria-label={`Report or hide ${entry.name}`}
        aria-expanded={open === entry.playerId}
        onClick={() => {
          setOpen(open === entry.playerId ? null : entry.playerId);
          setArmed(null);
        }}
      />
    );

  const actionRow = (entry: Member) =>
    open === entry.playerId && (
      <li className="pill-row">
        <button type="button" className="pill outline" onClick={() => report(entry)}>
          Report name
        </button>
        <button
          type="button"
          className="pill outline"
          onClick={() => {
            updateHidden([...hiddenIds, entry.playerId]);
            setOpen(null);
          }}
        >
          Hide
        </button>
        {owner &&
          (armed === entry.playerId ? (
            <button type="button" className="pill danger" onClick={() => remove(entry)}>
              Remove
            </button>
          ) : (
            <button type="button" className="pill outline" onClick={() => setArmed(entry.playerId)}>
              Remove from group
            </button>
          ))}
      </li>
    );

  return (
    <>
      {head}
      <ol className="leaderboard">
        {shown.map((entry, i) => (
          <Fragment key={entry.playerId}>
            <StandingsRow entry={entry} rank={entry.rank} me={entry.playerId === meId} wave={i * 0.1}>
              {hitButton(entry)}
            </StandingsRow>
            {actionRow(entry)}
          </Fragment>
        ))}
        {board.open && (
          <li className="leaderboard-divider">{unsolved.shown.length > 0 ? `Not solved yet · ${unsolved.shown.length}` : 'Everyone solved it'}</li>
        )}
        {unsolved.shown.map((entry) => (
          <Fragment key={entry.playerId}>
            <OpenRow name={entry.name} hustle={entry.hustle} me={entry.playerId === meId}>
              {hitButton(entry)}
            </OpenRow>
            {actionRow(entry)}
          </Fragment>
        ))}
      </ol>
      {hiddenAll.length > 0 && (
        <div className="pill-row">
          <button
            type="button"
            className="pill outline"
            onClick={() => updateHidden(hiddenIds.filter((id) => !hiddenAll.some((e) => e.playerId === id)))}
          >
            {hiddenAll.length} hidden · Show
          </button>
        </div>
      )}
    </>
  );
}
