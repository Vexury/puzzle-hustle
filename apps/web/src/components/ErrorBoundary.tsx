import { Component, type ReactNode } from 'react';
import { href } from '../lib/router.ts';

interface Props {
  resetKey: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

// Generators throw during render, and a daily is the same puzzle for everyone, so one bad
// seed would take every player's app down on the same day.
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
