import { Component, type ReactNode } from 'react';
import { href } from '../lib/router.ts';

interface Props {
  resetKey: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

// Die Generatoren werfen, wenn ein Seed nicht aufgeht, und sie laufen waehrend des Renderns.
// Ohne diese Grenze reisst das den ganzen Baum ab: weisse Seite, und auf dem Play-Screen ohne
// Tab-Leiste auch kein Weg zurueck. Dailys sind fuer alle gleich, ein solcher Seed traefe
// also nicht einen Spieler, sondern an dem Tag jeden.
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error('render failed', error);
  }

  override componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="stack">
        <div className="card-lg">
          <b>This one would not load</b>
          <span className="muted small">Something went wrong while building this puzzle. Everything you have solved is safe.</span>
          <a className="pill" href={href('/')}>
            Back to Daily
          </a>
        </div>
      </section>
    );
  }
}
