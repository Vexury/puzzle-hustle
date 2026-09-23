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
          <path d="M11.8 24.9 L11.2 14.7 L16.6 18.8 L20 12 L23.4 18.8 L28.8 14.7 L28.2 24.9 Z" className="ic-a" />
          <rect x="11.8" y="26" width="16.4" height="2" rx="0.7" className="ic-a" />
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
          <polygon points="15,7 17.6,13 24,13.6 19.2,17.8 20.7,24 15,20.7 9.3,24 10.8,17.8 6,13.6 12.4,13" className="ic-a" />
          <polygon points="28,21 29.8,25.2 34.3,25.6 30.9,28.6 32,33 28,30.7 24,33 25.1,28.6 21.7,25.6 26.2,25.2" className="ic-a" />
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
