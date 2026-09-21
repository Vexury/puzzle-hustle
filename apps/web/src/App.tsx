import { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Intro } from './components/Intro.tsx';
import { TabBar } from './components/TabBar.tsx';
import { ToastHost } from './components/Toast.tsx';
import { useRoute } from './lib/router.ts';
import { Daily } from './pages/Daily.tsx';
import { Friends } from './pages/Friends.tsx';
import { LevelsIndex, LevelsType } from './pages/Levels.tsx';
import { Play } from './pages/Play.tsx';
import { Profile } from './pages/Profile.tsx';

// Position in the tab bar, for the direction of the slide. A puzzle is -1: opening or leaving
// one is not a move along the bar and stays still. Friends is reached by a card link, not a
// tab, and belongs to none of the three, so it stays still too. /join renders the same page
// from an invitation link and gets the same treatment.
function tabIndex(path: string): number {
  if (path === '/play' || path === '/friends' || path === '/join') return -1;
  if (path === '/profile') return 2;
  if (path.startsWith('/levels')) return 1;
  return 0;
}

export function App() {
  const route = useRoute();
  const [nav, setNav] = useState({ path: route.path, slide: '' });
  if (nav.path !== route.path) {
    const from = tabIndex(nav.path);
    const to = tabIndex(route.path);
    setNav({ path: route.path, slide: from < 0 || to < 0 || from === to ? '' : to > from ? ' slide-right' : ' slide-left' });
  }
  let page: React.ReactNode;
  let chrome = true;
  if (route.path === '/play') {
    page = <Play params={route.params} />;
    chrome = false;
  } else if (route.path === '/levels') page = <LevelsIndex />;
  else if (route.path.startsWith('/levels/')) page = <LevelsType type={route.path.slice('/levels/'.length)} />;
  else if (route.path === '/profile') page = <Profile />;
  else if (route.path === '/friends') page = <Friends />;
  else if (route.path === '/join') page = <Friends code={route.params.get('c') ?? ''} />;
  else page = <Daily />;

  return (
    <div className={chrome ? 'app' : 'app play-mode'}>
      <main>
        <div key={nav.path} className={`page${nav.slide}`}>
          <ErrorBoundary resetKey={`${route.path}?${route.params.toString()}`}>{page}</ErrorBoundary>
        </div>
      </main>
      {chrome && <TabBar />}
      {chrome && <Intro />}
      <ToastHost />
    </div>
  );
}
