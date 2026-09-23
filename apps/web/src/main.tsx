import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { syncAchievements } from './lib/achievements.ts';
import { initAccent } from './lib/accent.ts';
import { initBackButton } from './lib/back.ts';
import { restoreBackup } from './lib/backup.ts';
import { refreshEntitlement } from './lib/entitlement.ts';
import { syncFlairs } from './lib/flairs.ts';
import { initQueue } from './lib/queue.ts';
import { rehydrate } from './lib/storage.ts';
import { initTheme } from './lib/theme.ts';
import { markUnlocksLive } from './components/UnlockModal.tsx';
import './theme.css';

await restoreBackup();
rehydrate();

initTheme();
initAccent();
initBackButton();
initQueue();
syncAchievements();
syncFlairs();
// Anything syncAchievements()/syncFlairs() just announced is app-start catch-up and opens right
// away; everything announced after this point (in practice, only ever a solve) is "live" and
// gets the modal's usual delay.
markUnlocksLive();
void refreshEntitlement();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
