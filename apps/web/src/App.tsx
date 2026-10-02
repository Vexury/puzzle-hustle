import { useEffect, useRef, useState } from 'react';
import { PackAnchor } from './packs/anchors.tsx';
import { PackLayer } from './packs/PackLayer.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Intro } from './components/Intro.tsx';
import { Launch } from './components/Launch.tsx';
import { TAB_PATHS, TabBar } from './components/TabBar.tsx';
import { ToastHost } from './components/Toast.tsx';
import { UnlockModalHost } from './components/UnlockModal.tsx';
import { SIGN_IN_AVAILABLE, useSession } from './lib/auth.ts';
import { href, navigate, useRoute } from './lib/router.ts';
import { useTabSwipe } from './lib/useTabSwipe.ts';
import { Achievements } from './pages/Achievements.tsx';
import { Daily } from './pages/Daily.tsx';
import { Hustle } from './pages/Hustle.tsx';
import { DeleteAccount } from './pages/DeleteAccount.tsx';
import { LevelsIndex, LevelsType } from './pages/Levels.tsx';
import { Play } from './pages/Play.tsx';
import { Profile } from './pages/Profile.tsx';
import { Shop } from './pages/Shop.tsx';
import { Social } from './pages/Friends.tsx';
import { Stats } from './pages/Stats.tsx';
import { Gameplay } from './pages/Gameplay.tsx';
import { Account } from './pages/Account.tsx';

// Position in the tab bar, for the direction of the slide. A puzzle is -1: it sits below the
// bar rather than on it and gets its own direction below. The pages behind Profile's rows stay
// still too; /join is Social entered through an invitation link, and /friends (the old Social
// tab) only redirects.
const PROFILE_PAGES = ['/achievements', '/shop', '/social', '/join', '/stats', '/gameplay', '/account'];

function tabIndex(path: string): number {
  if (path === '/play' || PROFILE_PAGES.includes(path)) return -1;
  if (path === '/profile' || path === '/friends') return 3;
  if (path.startsWith('/levels')) return 2;
  if (path === '/hustle') return 1;
  return 0;
}

export function App() {
  const route = useRoute();
  const session = useSession();
  const [nav, setNav] = useState({ path: route.path, slide: '' });
  // An invitation opened while signed out. Signing in happens on Profile only, so the code
  // waits here and the player is sent on to the group once the session exists.
  const [pendingJoin, setPendingJoin] = useState<string | null>(null);
  // Social is a page under Profile since 2026-09-30; /friends stays for old links and bookmarks.
  useEffect(() => {
    if (route.path === '/friends' || (route.path === '/social' && !session)) navigate(href(session ? '/social' : '/profile'), true);
    if (route.path !== '/join' || session) return;
    const code = route.params.get('c')?.trim().toUpperCase().slice(0, 6);
    if (code && SIGN_IN_AVAILABLE) setPendingJoin(code);
    navigate(href('/profile'), true);
  }, [session, route]);

  // Only a sign-in during this run counts: a session restored at startup is already there on
  // the first render, so it never looks like a change from signed out.
  const signedIn = useRef(session !== null);
  useEffect(() => {
    const was = signedIn.current;
    signedIn.current = session !== null;
    if (!session || was || !pendingJoin) return;
    setPendingJoin(null);
    navigate(href(`/join?c=${pendingJoin}`));
  }, [session]);
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
  } else if (route.path === '/delete-account' || route.path === '/delete-account/') {
    // Opened from the Play listing by people who may never have used the app: no tab bar, no intro.
    // Pages serves it from delete-account/index.html and redirects the bare path to the slash.
    page = <DeleteAccount />;
    chrome = false;
  } else if (route.path === '/hustle') page = <Hustle />;
  else if (route.path === '/levels') page = <LevelsIndex />;
  else if (route.path.startsWith('/levels/')) page = <LevelsType type={route.path.slice('/levels/'.length)} />;
  else if (route.path === '/join' && session) page = <Social code={route.params.get('c') ?? ''} />;
  else if (route.path === '/social' && session) page = <Social group={route.params.get('g')} puzzle={route.params.get('p')} />;
  else if (route.path === '/stats') page = <Stats />;
  else if (route.path === '/gameplay') page = <Gameplay />;
  else if (route.path === '/account') page = <Account />;
  else if (route.path === '/profile' || route.path === '/friends' || route.path === '/join' || route.path === '/social') page = <Profile joinCode={pendingJoin} />;
  else if (route.path === '/achievements') page = <Achievements />;
  else if (route.path === '/shop') page = <Shop />;
  else page = <Daily />;
  const mainRef = useRef<HTMLElement>(null);
  useTabSwipe(mainRef, TAB_PATHS, chrome ? tabIndex(route.path) : -1);

  return (
    <>
      <PackLayer />
      <div className={chrome ? 'app' : 'app play-mode'}>
        <main ref={mainRef}>
          <div key={nav.path} className={`page${nav.slide}`}>
            <ErrorBoundary resetKey={`${route.path}?${route.params.toString()}`}>{page}</ErrorBoundary>
            <PackAnchor name="page-end" />
          </div>
        </main>
        {chrome && <TabBar />}
        {chrome && <Intro />}
        <ToastHost />
        <UnlockModalHost />
        <Launch />
      </div>
    </>
  );
}
