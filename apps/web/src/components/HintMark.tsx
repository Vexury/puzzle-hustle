// The hint mark on SVG boards: drawn above the cells and inset, so the stroke stays inside the
// hinted cells instead of straddling edges the neighbours paint over.
export function HintMark({ x, y, w = 1, h = 1, inset = 0.07, rx = 0.1 }: { x: number; y: number; w?: number; h?: number; inset?: number; rx?: number }) {
  return <rect className="hint-mark" x={x + inset} y={y + inset} width={w - 2 * inset} height={h - 2 * inset} rx={rx} />;
}
