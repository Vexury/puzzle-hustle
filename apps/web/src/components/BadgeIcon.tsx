import type { ReactNode } from 'react';

// Own shapes rather than emoji, which differ between Android, iOS and Windows and would show
// one badge three ways in the same group. Single colour, so they follow theme and accent.
const SHAPES: Record<string, ReactNode> = {
  bolt: <path d="M13 2 4 14h7l-1 8 10-13h-7z" />,
  leaf: <path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16Z" />,
  cat: <path d="M4 4l5 5h6l5-5v12a8 6 0 0 1-16 0Z" />,
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path
        d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
  ghost: <path d="M5 21V11a7 7 0 0 1 14 0v10l-2.5-2-2.5 2-2-2-2 2-2.5-2Z" />,
  rocket: <path d="M12 2c4 3 5 8 4 13H8C7 10 8 5 12 2Zm-4 13-3 4 4-1Zm8 0 3 4-4-1Z" />,
  diamond: <path d="M6 3h12l4 6-10 12L2 9Z" />,
};

export function BadgeIcon({ id, className = 'badge-icon' }: { id: string; className?: string }) {
  const shape = SHAPES[id];
  if (!shape) return null;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {shape}
    </svg>
  );
}
