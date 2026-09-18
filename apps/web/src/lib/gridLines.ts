export function gridBlock(n: number): number {
  for (const b of [5, 4, 3, 6, 7]) if (n % b === 0 && n / b >= 2) return b;
  return 0;
}

export function gridLineClasses(r: number, c: number, rows: number, cols: number, inner = true): string[] {
  const br = inner ? gridBlock(rows) : 0;
  const bc = inner ? gridBlock(cols) : 0;
  const cls: string[] = [];
  if (c === 0) cls.push('first-col');
  if (r === 0) cls.push('first-row');
  if (c === cols - 1) cls.push('last-col');
  if (r === rows - 1) cls.push('last-row');
  if (bc && (c + 1) % bc === 0 && c + 1 < cols) cls.push('gr');
  if (br && (r + 1) % br === 0 && r + 1 < rows) cls.push('gb');
  return cls;
}
