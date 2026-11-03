import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';

interface PwaState {
  needRefresh: boolean;
  offlineReady: boolean;
  update: () => void;
  dismiss: () => void;
}

let updateSW: ((reload?: boolean) => Promise<void>) | undefined;

export const usePwa = create<PwaState>()((set) => ({
  needRefresh: false,
  offlineReady: false,
  update: () => void updateSW?.(true),
  dismiss: () => set({ needRefresh: false, offlineReady: false }),
}));

/** Register the service worker; new versions wait until the user taps "Update". */
export function setupPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  updateSW = registerSW({
    onNeedRefresh: () => usePwa.setState({ needRefresh: true }),
    onOfflineReady: () => usePwa.setState({ offlineReady: true }),
    onRegisteredSW: (_url, reg) => {
      // Check for updates hourly while the app stays open.
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
    },
  });
}
