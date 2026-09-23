import { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Intro } from './components/Intro.tsx';
import { TabBar } from './components/TabBar.tsx';
import { ToastHost } from './components/Toast.tsx';
import { UnlockModalHost } from './components/UnlockModal.tsx';
import { useRoute } from './lib/router.ts';
import { Achievements } from './pages/Achievements.tsx';
import { Daily } from './pages/Daily.tsx';
import { Friends } from './pages/Friends.tsx';
import { LevelsIndex, LevelsType } from './pages/Levels.tsx';
import { Play } from './pages/Play.tsx';
import { Profile } from './pages/Profile.tsx';
import { Shop } from './pages/Shop.tsx';

// Position in the tab bar, for the direction of the slide. A puzzle is -1: it sits below the
// bar rather than on it and gets its own direction below. Achievements and the shop are each
// reached from a card rather than from the bar, so they stay still too. /join is the Social tab
// entered through an invitation link and slides like the tab it is.
function tabIndex(path: string): number {
  if (path === '/play' || path === '/achievements' || path === '/shop') return -1;
  if (path === '/friends' || path === '/join') return 3;
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
    // A puzzle is a level deeper, not a step sideways: opening one comes in from the right,
    // leaving it brings the list back in from the left. Both directions are checked before the
    // tab axis, which only describes moves along the bar.
    const slide =
      route.path === '/play'
        ? ' slide-right'
        : nav.path === '/play'
          ? ' slide-left'
          : from < 0 || to < 0 || from === to
            ? ''
            : to > from
              ? ' slide-right'
              : ' slide-left';
    setNav({ path: route.path, slide });
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
  else if (route.path === '/achievements') page = <Achievements />;
  else if (route.path === '/shop') page = <Shop />;
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
      <UnlockModalHost />
    </div>
  );
}
