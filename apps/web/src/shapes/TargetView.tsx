import { atomFromIndex, atomPolygon } from '@puzzle-hustle/core';

export function TargetView({ size, target }: { size: number; target: Uint8Array }) {
  const atoms = [...target].map((lit, i) => {
    const { r, c, dir } = atomFromIndex(size, i);
    return <polygon key={i} className={lit ? 'target-atom lit' : 'target-atom'} points={atomPolygon(r, c, dir).map((p) => p.join(',')).join(' ')} />;
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Target pattern">
      {atoms}
      <rect x={0} y={0} width={size} height={size} className="grid-line" />
    </svg>
  );
}
