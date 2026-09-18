export interface Clue {
  len: number;
  color: number;
}

export const MARKED_EMPTY = 255;

export type LineAxis = 'row' | 'col';

export function filledColor(v: number): number {
  return v === MARKED_EMPTY ? 0 : v;
}

export function lineClues(cells: ArrayLike<number>): Clue[] {
  const out: Clue[] = [];
  let color = 0;
  let run = 0;
  for (let i = 0; i <= cells.length; i++) {
    const v = i < cells.length ? filledColor(cells[i]!) : 0;
    if (v === color) {
      if (v) run++;
      continue;
    }
    if (color) out.push({ len: run, color });
    color = v;
    run = v ? 1 : 0;
  }
  return out;
}

export function cluesEqual(a: readonly Clue[], b: readonly Clue[]): boolean {
  return a.length === b.length && a.every((x, i) => x.len === b[i]!.len && x.color === b[i]!.color);
}

export function readLine(grid: Uint8Array, rows: number, cols: number, axis: LineAxis, index: number): Uint8Array {
  const n = axis === 'row' ? cols : rows;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = grid[axis === 'row' ? index * cols + i : i * cols + index]!;
  return out;
}

export function writeLine(grid: Uint8Array, cols: number, axis: LineAxis, index: number, line: Uint8Array): void {
  for (let i = 0; i < line.length; i++) grid[axis === 'row' ? index * cols + i : i * cols + index] = line[i]!;
}

export function gridClues(grid: Uint8Array, rows: number, cols: number): { rowClues: Clue[][]; colClues: Clue[][] } {
  const rowClues: Clue[][] = [];
  const colClues: Clue[][] = [];
  for (let r = 0; r < rows; r++) rowClues.push(lineClues(readLine(grid, rows, cols, 'row', r)));
  for (let c = 0; c < cols; c++) colClues.push(lineClues(readLine(grid, rows, cols, 'col', c)));
  return { rowClues, colClues };
}
