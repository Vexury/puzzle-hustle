import { Fragment, useEffect, useRef, useState } from 'react';
import { findCosmetic, parsePuzzleId, type Cosmetic, type Period } from '@puzzle-hustle/core';
import { apiFetch } from '../lib/api.ts';
import { formatSeconds } from '../lib/share.ts';
import { readSetting, writeSetting } from '../lib/storage.ts';
import { BadgeIcon } from './BadgeIcon.tsx';
import { toast } from './Toast.tsx';

export interface BoardData {
  entries: Array<{ playerId: string; name: string; seconds: number; hints: number; badge?: string | null; flair?: string | null }>;
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
): { shown: T[]; hidden: T[] } {
  const set = new Set(hidden);
  const isHidden = (entry: T) => entry.playerId !== meId && set.has(entry.playerId);
  return { shown: entries.filter((e) => !isHidden(e)), hidden: entries.filter(isHidden) };
}

// How long an armed Remove stays armed, as for Reset on Profile.
const CONFIRM_MS = 2000;

// "Faster than N%" compares against everybody else who solved this puzzle, so the player
// themselves is out of both sides of the fraction. Below 20 submissions the number says
// more about the size of the field than about the player, so it stays hidden.
export function percentileText(percentile: BoardData['percentile'], period: Period): string | null {
  if (!percentile || percentile.total < 20) return null;
  const others = percentile.total - 1;
  const beaten = others - percentile.faster;
  const when = period === 'weekly' ? 'this week' : period === 'monthly' ? 'this month' : 'today';
  return `Faster than ${Math.round((beaten / others) * 100)}% of all players ${when}`;
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

export function NameCell({ entry }: { entry: { name: string; badge?: string | null; flair?: string | null } }) {
  const { badge, flair } = rowCosmetics(entry);
  return (
    <span className="leaderboard-who">
      <span className="leaderboard-name">
        <span className="leaderboard-name-text">{entry.name}</span>
        {badge && <BadgeIcon id={badge.id} />}
      </span>
      {flair && <span className="leaderboard-flair">{flair.title}</span>}
    </span>
  );
}

export function Board({
  groupId,
  puzzle,
  meId,
  owner = false,
  onRemoved,
}: {
  groupId: string;
  puzzle: string;
  meId: string;
  owner?: boolean;
  onRemoved?: () => void;
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

  if (loading && !board) return <p className="muted small">Loading…</p>;
  if (!board) return <p className="muted small">Standings are unavailable right now.</p>;
  if (board.entries.length === 0) return <p className="muted small">Nobody in this group has solved it yet.</p>;

  const { shown, hidden } = splitHidden(board.entries, hiddenIds, meId);
  const percentile = percentileText(board.percentile, parsePuzzleId(puzzle)?.period ?? 'daily');

  const updateHidden = (ids: string[]) => {
    writeHidden(ids);
    setHiddenIds(readHidden());
  };

  const report = (entry: BoardData['entries'][number]) =>
    void apiFetch('/report', {
      method: 'POST',
      body: JSON.stringify({ playerId: entry.playerId, reason: 'name' }),
      auth: true,
    })
      .then(() => toast('Reported'))
      .catch(() => toast('Could not report'));

  const remove = (entry: BoardData['entries'][number]) =>
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

  return (
    <>
      <ol className="leaderboard">
        {shown.map((entry, index) => (
          <Fragment key={entry.playerId}>
            <li
              className={`leaderboard-row${index < 3 ? ` podium ${MEDALS[index]}` : ''}${entry.playerId === meId ? ' me' : ''}`}
            >
              <span className="leaderboard-rank">
                {index === 0 && <Crown />}
                {index + 1}
              </span>
              <NameCell entry={entry} />
              {entry.hints > 0 && <span className="muted small">{entry.hints} hint{entry.hints === 1 ? '' : 's'}</span>}
              <span className="leaderboard-time">{formatSeconds(entry.seconds)}</span>
              {entry.playerId !== meId && (
                <button
                  type="button"
                  className="leaderboard-report"
                  aria-label={`Report or hide ${entry.name}`}
                  aria-expanded={open === entry.playerId}
                  title="Report or hide"
                  onClick={() => {
                    setOpen(open === entry.playerId ? null : entry.playerId);
                    setArmed(null);
                  }}
                >
                  ⚑
                </button>
              )}
            </li>
            {open === entry.playerId && (
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
            )}
          </Fragment>
        ))}
      </ol>
      {hidden.length > 0 && (
        <div className="pill-row">
          <button
            type="button"
            className="pill outline"
            onClick={() => updateHidden(hiddenIds.filter((id) => !hidden.some((e) => e.playerId === id)))}
          >
            {hidden.length} hidden · Show
          </button>
        </div>
      )}
      {percentile && <p className="muted small">{percentile}</p>}
    </>
  );
}
