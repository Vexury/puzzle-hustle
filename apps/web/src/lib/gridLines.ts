// Thick lines after every fifth cell, whatever the board size, so counting always works the same.
const BLOCK = 5;

export function gridLineClasses(r: number, c: number, rows: number, cols: number, inner = true): string[] {
  const cls: string[] = [];
  if (c === 0) cls.push('first-col');
  if (r === 0) cls.push('first-row');
  if (c === cols - 1) cls.push('last-col');
  if (r === rows - 1) cls.push('last-row');
  if (inner && (c + 1) % BLOCK === 0 && c + 1 < cols) cls.push('gr');
  if (inner && (r + 1) % BLOCK === 0 && r + 1 < rows) cls.push('gb');
  return cls;
}
