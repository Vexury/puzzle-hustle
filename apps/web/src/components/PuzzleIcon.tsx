import type { PuzzleTypeId } from '@puzzle-hustle/core';

export function PuzzleIcon({ type, size = 56 }: { type: PuzzleTypeId; size?: number }) {
  return (
    <span className="puzzle-icon" style={{ width: size, height: size }} aria-hidden="true">
      {type === 'shapes' ? (
        <svg viewBox="0 0 40 40">
          <rect x="7" y="7" width="16" height="16" className="ic-a" />
          <polygon points="25,13 37,25 25,37 13,25" className="ic-a" />
          <polygon points="17,13 25,13 25,21" className="ic-cut" />
        </svg>
      ) : type === 'mosaic' ? (
        <svg viewBox="0 0 40 40">
          <g className="ic-grid">
            {[1, 2].map((i) => (
              <line key={`h${i}`} x1="6" y1={6 + i * 9.33} x2="34" y2={6 + i * 9.33} />
            ))}
            {[1, 2].map((i) => (
              <line key={`v${i}`} x1={6 + i * 9.33} y1="6" x2={6 + i * 9.33} y2="34" />
            ))}
          </g>
          <rect x="7" y="7" width="7.5" height="7.5" rx="1" className="ic-a" />
          <rect x="16.3" y="7" width="7.5" height="7.5" rx="1" className="ic-a" />
          <rect x="25.6" y="16.3" width="7.5" height="7.5" rx="1" className="ic-a" />
          <text x="20" y="24" textAnchor="middle" fontSize="10" fontWeight="700" className="ic-text">
            3
          </text>
        </svg>
      ) : (
        <svg viewBox="0 0 40 40">
          <g className="ic-grid">
            {[0, 1, 2, 3].map((i) => (
              <line key={`h${i}`} x1="6" y1={10 + i * 8} x2="34" y2={10 + i * 8} />
            ))}
            {[0, 1, 2, 3].map((i) => (
              <line key={`v${i}`} x1={10 + i * 8} y1="6" x2={10 + i * 8} y2="34" />
            ))}
          </g>
          {[[10, 10], [18, 10], [26, 18], [18, 26], [10, 26], [26, 26]].map(([x = 0, y = 0]) => (
            <rect key={`${x}${y}`} x={x + 1} y={y + 1} width="6" height="6" rx="1" className="ic-a" />
          ))}
        </svg>
      )}
    </span>
  );
}
