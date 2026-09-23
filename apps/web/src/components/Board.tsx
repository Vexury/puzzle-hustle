import { useEffect, useRef, useState } from 'react';
import { findCosmetic, parsePuzzleId, type Cosmetic, type Period } from '@puzzle-hustle/core';
import { apiFetch } from '../lib/api.ts';
import { formatSeconds } from '../lib/share.ts';
import { BadgeIcon } from './BadgeIcon.tsx';
import { toast } from './Toast.tsx';

export interface BoardData {
  entries: Array<{ playerId: string; name: string; seconds: number; hints: number; badge?: string | null; flair?: string | null }>;
  me: number | null;
  percentile: { total: number; faster: number } | null;
}

export function useBoard(groupId: string | null, puzzle: string): { board: BoardData | null; loading: boolean } {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(false);
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
  }, [groupId, puzzle]);
  return { board, loading };
}

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
        {entry.name}
        {badge && <BadgeIcon id={badge.id} />}
      </span>
      {flair && <span className="leaderboard-flair">{flair.title}</span>}
    </span>
  );
}

export function Board({ groupId, puzzle, meId }: { groupId: string; puzzle: string; meId: string }) {
  const { board, loading } = useBoard(groupId, puzzle);
  if (loading && !board) return <p className="muted small">Loading…</p>;
  if (!board) return <p className="muted small">Standings are unavailable right now.</p>;
  if (board.entries.length === 0) return <p className="muted small">Nobody in this group has solved it yet.</p>;

  const percentile = percentileText(board.percentile, parsePuzzleId(puzzle)?.period ?? 'daily');
  return (
    <>
      <ol className="leaderboard">
        {board.entries.map((entry, index) => (
          <li
            key={entry.playerId}
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
                aria-label={`Report ${entry.name}`}
                title="Report this name"
                onClick={() =>
                  void apiFetch('/report', {
                    method: 'POST',
                    body: JSON.stringify({ playerId: entry.playerId, reason: 'name' }),
                    auth: true,
                  })
                    .then(() => toast('Reported'))
                    .catch(() => toast('Could not report'))
                }
              >
                ⚑
              </button>
            )}
          </li>
        ))}
      </ol>
      {percentile && <p className="muted small">{percentile}</p>}
    </>
  );
}
