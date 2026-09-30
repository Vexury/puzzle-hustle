import { BackLink } from './BackLink.tsx';
import { CoinPill } from './CoinPill.tsx';

// Head of a page reached from a Profile row: back to Profile, the title and the coins.
export function SubpageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="page-head">
      <div className="head-back">
        <BackLink fallback="/profile" />
        <h1>{title}</h1>
        <CoinPill />
      </div>
      {children}
    </section>
  );
}
