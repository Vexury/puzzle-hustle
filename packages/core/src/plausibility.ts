// What counts as a physically impossible solve.
//
// This replaced a table of per-type second floors on 2026-09-22, an hour after the board
// went live, because one of those floors threw away a real result: a daily Shapes solved in
// 3 seconds with 8 moves and no hints. The floors were guesses, they protected nothing a
// determined cheat could not bypass anyway, and the first thing they did with real data was
// reject it. The design says so itself: a rejected submission is a player's lost result, a
// missed cheat costs one line in a list only friends can see, and erring strict is the
// worse error.
//
// What is left is the only bound defensible without data. A person cannot act faster than
// their hands, so a claim of many moves in almost no time is impossible in a way that a fast
// solve is not. Everything beyond that is the social structure's job: these lists are seen
// only by people who know each other.

// A move every 100 ms, sustained, with no thinking in between. Already generous.
export const MAX_MOVES_PER_SECOND = 10;

// Below a second the client's own clock is the thing that is wrong, not the player.
export const MIN_SECONDS = 1;

export function implausible(seconds: number, moves: number): boolean {
  if (seconds < MIN_SECONDS || moves < 1) return true;
  return moves > seconds * MAX_MOVES_PER_SECOND;
}
