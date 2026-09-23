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
import './theme.css';

await restoreBackup();
rehydrate();

initTheme();
initAccent();
initBackButton();
initQueue();
syncAchievements();
syncFlairs();
void refreshEntitlement();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
