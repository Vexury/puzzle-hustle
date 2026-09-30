import { useEffect, useState } from 'react';
import { ACHIEVEMENTS } from '@puzzle-hustle/core';
import { useGroups } from './Friends.tsx';
import { adsAvailable, onAdsConsent, privacyOptionsAvailable, showPrivacyOptions } from '../lib/ads.ts';
import { currentUnlocked } from '../lib/achievements.ts';
import { isAppleSession, useSession } from '../lib/auth.ts';
import { href, onLinkClick } from '../lib/router.ts';
import { useSolves } from '../lib/storage.ts';
import { dailyStreaks, totalSolved } from '../lib/stats.ts';
import { appVersion } from '../lib/version.ts';
import { PRIVACY_POLICY_URL, ProfileHero, TrophyIcon } from '../components/AccountCard.tsx';
import { Chevron } from '../components/Chevron.tsx';
import { CoinPill } from '../components/CoinPill.tsx';
import { Logo } from '../components/Logo.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';

// Profile is a hub: the hero on top, then one row per page. Something new gets a row, so the
// page itself does not grow.
export function Profile({ joinCode = null }: { joinCode?: string | null } = {}) {
  const session = useSession();
  const solves = useSolves();
  const { groups } = useGroups();
  const [privacy, setPrivacy] = useState(privacyOptionsAvailable);
  useEffect(() => onAdsConsent(() => setPrivacy(privacyOptionsAvailable())), []);
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    void appVersion().then(setVersion, () => {});
  }, []);

  return (
    <>
      <header className="page-head">
        <h1>Profile</h1>
        <div className="head-actions">
          <CoinPill />
          <ThemeToggle />
        </div>
      </header>

      {joinCode && (
        <div className="card-lg profile-join">
          <b>
            Join group <span className="num">{joinCode}</span>
          </b>
          <span className="muted small">Sign in below and you go straight to the group.</span>
        </div>
      )}
      <ProfileHero joinCode={joinCode} />

      <div className="stack">
        {session && (
          <Row
            to="/social"
            icon={<SocialIcon />}
            title="Social"
            sub={groups.length === 0 ? 'Groups and standings' : `${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`}
          />
        )}
        <Row to="/achievements" icon={<TrophyIcon />} title="Achievements" sub={`${currentUnlocked().size} of ${ACHIEVEMENTS.length} earned`} />
        <Row to="/stats" icon={<StatsIcon />} title="Stats" sub={`${totalSolved(solves)} solved · ${dailyStreaks(solves).daysPlayed} days played`} />
      </div>

      <h2 className="section-h">Settings</h2>
      <div className="stack section-body">
        <Row to="/shop" icon={<BrushIcon />} title="Customize" sub="Theme, badge and flair" />
        <Row to="/gameplay" icon={<GearIcon />} title="Gameplay" sub="Highlights, mistakes, haptics" />
        <Row to="/account" icon={<PersonIcon />} title="Account" sub={session ? `Signed in with ${isAppleSession() ? 'Apple' : 'Google'}` : 'Purchase, stats, reset'} />
      </div>

      <footer className="profile-footer">
        <Logo className="footer-logo" />
        <p>
          <b>Puzzle Hustle</b>
          {version && <span className="muted"> · {version}</span>}
        </p>
        <p className="muted">Your progress stays on this device.</p>
        <nav className="footer-links" aria-label="About">
          <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">
            Privacy policy
          </a>
          {adsAvailable && privacy && (
            <button type="button" className="linklike" onClick={() => void showPrivacyOptions()}>
              Ad privacy settings
            </button>
          )}
          <a href="https://vexury.dev" target="_blank" rel="noreferrer">
            vexury.dev
          </a>
        </nav>
      </footer>
    </>
  );
}

function Row({ to, icon, title, sub }: { to: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <a href={href(to)} onClick={onLinkClick} className="row-card profile-row">
      <span className="row-glyph">{icon}</span>
      <span className="row-text">
        <span className="row-title">{title}</span>
        <span className="row-sub">{sub}</span>
      </span>
      <Chevron size={20} />
    </a>
  );
}

function SocialIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.5 20c0-3.4 2.9-5.8 6.5-5.8s6.5 2.4 6.5 5.8" />
      <circle cx="17.5" cy="7" r="2.6" />
      <path d="M16 13.2c3.1-.6 5.5 1.6 5.5 4.6" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 20V11M11 20V5M17 20v-6M3 20h18" />
    </svg>
  );
}

function BrushIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2z" />
      <path d="M4 20l3-3" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
