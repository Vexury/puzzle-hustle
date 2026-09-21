import { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Intro } from './components/Intro.tsx';
import { TabBar } from './components/TabBar.tsx';
import { ToastHost } from './components/Toast.tsx';
import { useRoute } from './lib/router.ts';
import { Daily } from './pages/Daily.tsx';
import { LevelsIndex, LevelsType } from './pages/Levels.tsx';
import { Play } from './pages/Play.tsx';
import { Profile } from './pages/Profile.tsx';

// Position in the tab bar, for the direction of the slide. A puzzle is -1: opening or leaving
// one is not a move along the bar and stays still.
function tabIndex(path: string): number {
  if (path === '/play') return -1;
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
