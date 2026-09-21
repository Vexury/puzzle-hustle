import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import { formatSeconds } from '../lib/share.ts';
import { toast } from './Toast.tsx';

export interface BoardData {
  entries: Array<{ playerId: string; name: string; seconds: number; hints: number }>;
  me: number | null;
  percentile: { total: number; faster: number } | null;
}

export function useBoard(groupId: string | null, puzzle: string): { board: BoardData | null; loading: boolean } {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!groupId) {
      setBoard(null);
      return;
    }
    setLoading(true);
    apiFetch<BoardData>(`/board?group=${encodeURIComponent(groupId)}&puzzle=${encodeURIComponent(puzzle)}`, { auth: true })
      .then(setBoard)
      .catch(() => setBoard(null))
      .finally(() => setLoading(false));
  }, [groupId, puzzle]);
  return { board, loading };
}

// "Faster than N%" compares against everybody else who solved this puzzle, so the player
// themselves is out of both sides of the fraction. Below 20 submissions the number says
// more about the size of the field than about the player, so it stays hidden.
export function percentileText(percentile: BoardData['percentile']): string | null {
  if (!percentile || percentile.total < 20) return null;
  const others = percentile.total - 1;
  const beaten = others - percentile.faster;
  return `Faster than ${Math.round((beaten / others) * 100)}% of all players today`;
}

export function Board({ groupId, puzzle, meId }: { groupId: string; puzzle: string; meId: string }) {
  const { board, loading } = useBoard(groupId, puzzle);
  if (loading && !board) return <p className="muted small">Loading…</p>;
  if (!board) return <p className="muted small">Standings are unavailable right now.</p>;
  if (board.entries.length === 0) return <p className="muted small">Nobody in this group has solved it yet.</p>;

  const percentile = percentileText(board.percentile);
  return (
    <>
      <ol className="leaderboard">
        {board.entries.map((entry, index) => (
          <li key={entry.playerId} className={entry.playerId === meId ? 'leaderboard-row me' : 'leaderboard-row'}>
            <span className="leaderboard-rank num">{index + 1}</span>
            <span className="leaderboard-name">{entry.name}</span>
            {entry.hints > 0 && <span className="muted small">{entry.hints} hint{entry.hints === 1 ? '' : 's'}</span>}
            <span className="leaderboard-time num">{formatSeconds(entry.seconds)}</span>
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
