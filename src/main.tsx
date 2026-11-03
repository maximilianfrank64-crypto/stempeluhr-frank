import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { requestPersistence } from './features/backup/storage';
import { useApp } from './store/appStore';
import { setupPwa } from './ui/pwa';
import './styles.css';

setupPwa();
void useApp.getState().init();
// Ask early: on iOS this is typically granted for Home Screen apps.
void requestPersistence();

// Deliver anything still waiting whenever there is a chance: back online,
// app brought to the front, and once a minute while it is open.
const flush = () => void useApp.getState().flushOutbox();
window.addEventListener('online', flush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') flush();
});
setInterval(() => {
  void useApp
    .getState()
    .housekeeping()
    .then(() => useApp.getState().flushOutbox());
}, 60_000);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
