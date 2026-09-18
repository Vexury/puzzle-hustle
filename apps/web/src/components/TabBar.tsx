import { href, onLinkClick, useRoute } from '../lib/router.ts';

const TABS = [
  { path: '/', label: 'Daily', match: (p: string) => p === '/' },
  { path: '/levels', label: 'Puzzles', match: (p: string) => p.startsWith('/levels') },
  { path: '/profile', label: 'Profile', match: (p: string) => p === '/profile' },
] as const;

function Icon({ name }: { name: 'Daily' | 'Puzzles' | 'Profile' }) {
  switch (name) {
    case 'Daily':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="8" y1="3" x2="8" y2="7" />
          <line x1="16" y1="3" x2="16" y2="7" />
          <rect x="7" y="13" width="3" height="3" rx="0.5" className="fill" />
        </svg>
      );
    case 'Puzzles':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="8" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
          <rect x="13" y="13" width="8" height="8" rx="2" className="fill" />
        </svg>
      );
    case 'Profile':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      );
  }
}

export function TabBar() {
  const route = useRoute();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <a key={t.path} href={href(t.path)} onClick={onLinkClick} className={t.match(route.path) ? 'tab active' : 'tab'} aria-current={t.match(route.path) ? 'page' : undefined}>
          <Icon name={t.label} />
          <span>{t.label}</span>
        </a>
      ))}
    </nav>
  );
}
