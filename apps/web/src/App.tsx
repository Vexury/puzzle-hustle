import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { TabBar } from './components/TabBar.tsx';
import { ToastHost } from './components/Toast.tsx';
import { useRoute } from './lib/router.ts';
import { Daily } from './pages/Daily.tsx';
import { LevelsIndex, LevelsType } from './pages/Levels.tsx';
import { Play } from './pages/Play.tsx';
import { Profile } from './pages/Profile.tsx';

export function App() {
  const route = useRoute();
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
        <ErrorBoundary resetKey={`${route.path}?${route.params.toString()}`}>{page}</ErrorBoundary>
      </main>
      {chrome && <TabBar />}
      <ToastHost />
    </div>
  );
}
