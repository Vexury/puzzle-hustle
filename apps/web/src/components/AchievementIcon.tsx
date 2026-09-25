import type { CSSProperties, ReactNode } from 'react';
import type { Achievement } from '@puzzle-hustle/core';
import { PuzzleIcon } from './PuzzleIcon.tsx';

const calendar = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4';
const flame = 'M12 3c.5 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.6 1.4-4 2.4-5.6.6 1.3 1.5 2 2.6 2.3-.4-2.2-.4-4.4 0-6.7z';
const star = 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z';
const layers = 'M4 8l8-4 8 4-8 4zM4 12l8 4 8-4M4 16l8 4 8-4';

// 24-unit line drawings in currentColor, so they follow theme and accent. The store icons are
// rendered from the same paths later.
export const GENERAL_ICONS: Record<string, string> = {
  'first-solve': 'M5 12.5l4.5 4.5L19 7.5',
  'every-type': 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  'daily-no-hint': 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3zM4 4l16 16',
  'first-weekly': `${calendar}M8 14h8`,
  'first-monthly': `${calendar}M9 15l2 2 4-4`,
  'first-genius': 'M3 18h18L19 7l-4 4-3-6-3 6-4-4z',
  'streak-3': flame,
  'streak-7': flame,
  'streak-30': flame,
  'streak-100': flame,
  'streak-365': flame,
  'perfect-day': star,
  'perfect-10': `${star}M12 9v4`,
  'perfect-day-no-hint': 'M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z',
  'solved-50': layers,
  'solved-250': layers,
  'solved-1000': layers,
  'weekly-10': `${calendar}M8 14h2M11 14h2M14 14h2M8 17h2`,
  'night-owl': 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  'early-bird': 'M4 18h16M7 18a5 5 0 0 1 10 0M12 7v3M5.6 10.6l1.8 1.8M18.4 10.6l-1.8 1.8',
};

const CORNER_PATHS = {
  speed: 'M12 8v4l2.5 2.5M9 3h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  genius: 'M3 18h18L19 7l-4 4-3-6-3 6-4-4z',
};

function Line({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="ach-glyph" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function AchievementIcon({
  achievement,
  earned,
  share,
  size = 52,
}: {
  achievement: Achievement;
  earned: boolean;
  share?: number;
  size?: number;
}) {
  const corner = !achievement.type ? null : achievement.id.endsWith('-speed') ? 'speed' : achievement.id.endsWith('-genius') ? 'genius' : null;
  let inner: ReactNode;
  if (achievement.type) inner = <PuzzleIcon type={achievement.type} size={Math.round(size * 0.62)} />;
  else inner = <Line d={GENERAL_ICONS[achievement.id] ?? GENERAL_ICONS['first-solve']!} />;

  const ring = !earned && share !== undefined && share > 0;
  const style = { width: size, height: size, ...(ring ? { '--share': `${Math.round(share * 100)}%` } : {}) } as CSSProperties;

  return (
    <span className={earned ? 'ach-disc earned' : 'ach-disc'} style={style} aria-hidden="true">
      {ring && <span className="ach-ring" />}
      <span className="ach-inner">{inner}</span>
      {corner && (
        <span className={`ach-corner ${corner}`}>
          <Line d={CORNER_PATHS[corner]} />
        </span>
      )}
    </span>
  );
}
