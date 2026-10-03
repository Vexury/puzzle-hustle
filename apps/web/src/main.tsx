import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { syncAchievements } from './lib/achievements.ts';
import { initAccent } from './lib/accent.ts';
import { completeGoogleRedirect } from './lib/auth.ts';
import { initBackButton } from './lib/back.ts';
import { restoreBackup } from './lib/backup.ts';
import { initEntitlement } from './lib/entitlement.ts';
import { initLaunch, signalLaunchReady } from './lib/launch.ts';
import { loadRefCache, saveRefCache } from './lib/refCache.ts';
import { currentPath } from './lib/router.ts';
import { syncFlairs } from './lib/flairs.ts';
import { syncHustleRewards } from './lib/hustle.ts';
import { initQueue } from './lib/queue.ts';
import { initSync } from './lib/sync.ts';
import { initTelemetry } from './lib/telemetry.ts';
import { rehydrate } from './lib/storage.ts';
import { initTheme } from './lib/theme.ts';
import { markUnlocksLive } from './components/UnlockModal.tsx';
import './theme.css';
import './packs/index.css';

await restoreBackup();
rehydrate();
loadRefCache();

// Backs up the user-select rule in theme.css, which iOS WebKit does not always honour.
document.addEventListener('selectstart', (e) => {
  const at = e.target instanceof Element ? e.target : e.target instanceof Node ? e.target.parentElement : null;
  if (!at?.closest('input, textarea')) e.preventDefault();
});

initTheme();
initAccent();
initBackButton();
initQueue();
initSync();
initTelemetry();
void completeGoogleRedirect();
syncAchievements();
syncFlairs();
syncHustleRewards();
// Anything syncAchievements()/syncFlairs() just announced is app-start catch-up and opens right
// away; everything announced after this point (in practice, only ever a solve) is "live" and
// gets the modal's usual delay.
markUnlocksLive();
initEntitlement();
initLaunch(currentPath());
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
signalLaunchReady();
// After the first frame, when the Daily page has asked for its seeds.
setTimeout(saveRefCache, 1000);
