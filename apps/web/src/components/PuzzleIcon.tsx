import { useId } from 'react';
import type { PuzzleTypeId } from '@puzzle-hustle/core';

export function PuzzleIcon({ type, size = 56 }: { type: PuzzleTypeId; size?: number }) {
  const clip = useId();
  return (
    <span className="puzzle-icon" style={{ width: size, height: size }} aria-hidden="true">
      {type === 'shapes' ? (
        <svg viewBox="0 0 40 40">
          <g className="ic-grid">
            {[1, 2].map((i) => (
              <line key={`h${i}`} x1="6" y1={6 + i * 9.33} x2="34" y2={6 + i * 9.33} />
            ))}
            {[1, 2].map((i) => (
              <line key={`v${i}`} x1={6 + i * 9.33} y1="6" x2={6 + i * 9.33} y2="34" />
            ))}
          </g>
          <defs>
            <clipPath id={clip}>
              <polygon points="6,15.33 15.33,6 24.67,15.33 15.33,24.67" />
            </clipPath>
          </defs>
          <rect x="15.33" y="15.33" width="18.67" height="18.67" className="ic-a" />
          <polygon points="6,15.33 15.33,6 24.67,15.33 15.33,24.67" className="ic-a" />
          <rect x="15.33" y="15.33" width="18.67" height="18.67" className="ic-cut" clipPath={`url(#${clip})`} />
        </svg>
      ) : type === 'crowns' ? (
        <svg viewBox="0 0 40 40">
          <g className="ic-grid">
            {[1, 2].map((i) => (
              <line key={`h${i}`} x1="6" y1={6 + i * 9.33} x2="34" y2={6 + i * 9.33} />
            ))}
            {[1, 2].map((i) => (
              <line key={`v${i}`} x1={6 + i * 9.33} y1="6" x2={6 + i * 9.33} y2="34" />
            ))}
          </g>
          <path d="M4 4l5 5h6l5-5v12a8 6 0 0 1-16 0Z" transform="translate(9.2 8.5) scale(0.9)" className="ic-a" />
        </svg>
      ) : type === 'stars' ? (
        <svg viewBox="0 0 40 40">
          <g className="ic-grid">
            {[1, 2].map((i) => (
              <line key={`h${i}`} x1="6" y1={6 + i * 9.33} x2="34" y2={6 + i * 9.33} />
            ))}
            {[1, 2].map((i) => (
              <line key={`v${i}`} x1={6 + i * 9.33} y1="6" x2={6 + i * 9.33} y2="34" />
            ))}
          </g>
          <path d="M12 21C6 16.5 2 13 2 8.5 2 5.5 4.3 3.5 7 3.5c2 0 3.8 1.1 5 3 1.2-1.9 3-3 5-3 2.7 0 5 2 5 5 0 4.5-4 8-10 12.5Z" transform="translate(5.5 5.5) scale(0.75)" className="ic-a" />
          <path d="M12 21C6 16.5 2 13 2 8.5 2 5.5 4.3 3.5 7 3.5c2 0 3.8 1.1 5 3 1.2-1.9 3-3 5-3 2.7 0 5 2 5 5 0 4.5-4 8-10 12.5Z" transform="translate(21.4 20.6) scale(0.55)" className="ic-a" />
        </svg>
      ) : type === 'tracks' ? (
        <svg viewBox="0 0 40 40">
          <g className="ic-grid">
            {[1, 2].map((i) => (
              <line key={`h${i}`} x1="6" y1={6 + i * 9.33} x2="34" y2={6 + i * 9.33} />
            ))}
            {[1, 2].map((i) => (
              <line key={`v${i}`} x1={6 + i * 9.33} y1="6" x2={6 + i * 9.33} y2="34" />
            ))}
          </g>
          <path d="M2 10.7H20Q24.7 10.7 24.7 15.3V24.7Q24.7 29.3 29.3 29.3H34" className="ic-path" />
        </svg>
      ) : type === 'zip' ? (
        <svg viewBox="0 0 40 40">
          <g className="ic-grid">
            {[1, 2].map((i) => (
              <line key={`h${i}`} x1="6" y1={6 + i * 9.33} x2="34" y2={6 + i * 9.33} />
            ))}
            {[1, 2].map((i) => (
              <line key={`v${i}`} x1={6 + i * 9.33} y1="6" x2={6 + i * 9.33} y2="34" />
            ))}
          </g>
          <polyline points="10.7,10.7 29.3,10.7 29.3,20 10.7,20 10.7,29.3 29.3,29.3" className="ic-path" />
          <circle cx="10.7" cy="10.7" r="4.6" className="ic-a" />
          <circle cx="29.3" cy="29.3" r="4.6" className="ic-a" />
          <text x="10.7" y="13" textAnchor="middle" fontSize="6.5" fontWeight="700" className="ic-on">
            1
          </text>
          <text x="29.3" y="31.6" textAnchor="middle" fontSize="6.5" fontWeight="700" className="ic-on">
            3
          </text>
        </svg>
      ) : type === 'sudoku' || type === 'killer' ? (
        <svg viewBox="0 0 40 40">
          <g className="ic-grid">
            {[1, 2].map((i) => (
              <line key={`h${i}`} x1="6" y1={6 + i * 9.33} x2="34" y2={6 + i * 9.33} />
            ))}
            {[1, 2].map((i) => (
              <line key={`v${i}`} x1={6 + i * 9.33} y1="6" x2={6 + i * 9.33} y2="34" />
            ))}
          </g>
          {type === 'killer' ? (
            <>
              <rect x="8" y="8" width="24.6" height="15" rx="2" className="ic-dash" />
              <text x="10.5" y="14" fontSize="6" fontWeight="700" className="ic-text">
                12
              </text>
              <text x="20" y="31.5" textAnchor="middle" fontSize="10" fontWeight="700" className="ic-text">
                7
              </text>
            </>
          ) : (
            <>
              <text x="10.7" y="14.5" textAnchor="middle" fontSize="8" fontWeight="700" className="ic-text">
                3
              </text>
              <text x="29.3" y="14.5" textAnchor="middle" fontSize="8" fontWeight="700" className="ic-text">
                8
              </text>
              <text x="20" y="24.5" textAnchor="middle" fontSize="11" fontWeight="700" className="ic-num">
                5
              </text>
              <text x="10.7" y="33" textAnchor="middle" fontSize="8" fontWeight="700" className="ic-text">
                1
              </text>
            </>
          )}
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
