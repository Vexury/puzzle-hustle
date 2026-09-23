import type { ReactNode } from 'react';

const PATHS = {
  reset: ['M3 12a9 9 0 1 0 2.64-6.36L3 8.3', 'M3 3v5.3h5.3'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  hint: ['M9 18h6', 'M10 21.5h4', 'M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8v.5h6v-.5c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 2.5z'],
  notes: ['M16.5 3.5a2.5 2.5 0 0 1 3.5 3.5L7.5 19.5 3 21l1.5-4.5z', 'M14.5 5.5l4 4'],
  erase: ['M7 21l-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21', 'M22 21H7', 'M5 11l9 9'],
} as const;

export type ToolIcon = keyof typeof PATHS;

export function ToolGlyph({ icon }: { icon: ToolIcon }) {
  return (
    <svg className="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[icon].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

interface ToolButtonProps {
  icon: ToolIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  pressed?: boolean;
  badge?: ReactNode;
}

export function ToolButton({ icon, label, onClick, disabled, className, pressed, badge }: ToolButtonProps) {
  return (
    <button type="button" className={className ? `tool ${className}` : 'tool'} onClick={onClick} disabled={disabled} aria-pressed={pressed}>
      <span className="tool-glyph">
        <ToolGlyph icon={icon} />
        {badge}
      </span>
      <span className="tool-label">{label}</span>
    </button>
  );
}

// The next hint costs a video, so the bulb carries a small play mark.
export function AdBadge() {
  return (
    <svg className="tool-badge" viewBox="0 0 12 12" aria-label="Watch a video">
      <circle cx="6" cy="6" r="6" />
      <path d="M4.6 3.6v4.8L8.4 6z" />
    </svg>
  );
}
