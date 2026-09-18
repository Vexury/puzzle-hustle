import { href, onLinkClick } from '../lib/router.ts';
import { useTheme } from '../lib/theme.ts';

export function Header() {
  const [theme, toggle] = useTheme();
  return (
    <header className="header">
      <a href={href('/')} className="brand" onClick={onLinkClick}>
        <img src={href('/icon.svg')} alt="" />
        Puzzle <span>Hustle</span>
      </a>
      <button type="button" className="icon-btn" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
        {theme === 'dark' ? '☀' : '☾'}
      </button>
    </header>
  );
}
