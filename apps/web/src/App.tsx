import { Header } from './components/Header.tsx';
import { ToastHost } from './components/Toast.tsx';
import { useRoute } from './lib/router.ts';
import { Home } from './pages/Home.tsx';
import { Play } from './pages/Play.tsx';

export function App() {
  const route = useRoute();
  const page = route.path === '/play' ? <Play params={route.params} /> : <Home />;
  return (
    <div className="app">
      <Header />
      <main>{page}</main>
      <footer className="footer">
        <span>Puzzle Hustle · a Vexury project</span>
        <a href="https://vexury.dev" target="_blank" rel="noreferrer">vexury.dev</a>
      </footer>
      <ToastHost />
    </div>
  );
}
