import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { syncAchievements } from './lib/achievements.ts';
import { initAccent } from './lib/accent.ts';
import { completeGoogleRedirect } from './lib/auth.ts';
import { initBackButton } from './lib/back.ts';
import { restoreBackup } from './lib/backup.ts';
import { initEntitlement } from './lib/entitlement.ts';
import { syncFlairs } from './lib/flairs.ts';
import { initQueue } from './lib/queue.ts';
import { initTelemetry } from './lib/telemetry.ts';
import { rehydrate } from './lib/storage.ts';
import { initTheme } from './lib/theme.ts';
import { markUnlocksLive } from './components/UnlockModal.tsx';
import './theme.css';
import './packs/index.css';

await restoreBackup();
rehydrate();

// Backs up the user-select rule in theme.css, which iOS WebKit does not always honour.
document.addEventListener('selectstart', (e) => {
  const at = e.target instanceof Element ? e.target : e.target instanceof Node ? e.target.parentElement : null;
  if (!at?.closest('input, textarea')) e.preventDefault();
});

initTheme();
initAccent();
initBackButton();
initQueue();
initTelemetry();
void completeGoogleRedirect();
syncAchievements();
syncFlairs();
// Anything syncAchievements()/syncFlairs() just announced is app-start catch-up and opens right
// away; everything announced after this point (in practice, only ever a solve) is "live" and
// gets the modal's usual delay.
markUnlocksLive();
initEntitlement();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
