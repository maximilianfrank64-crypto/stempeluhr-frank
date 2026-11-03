import { useEffect, useMemo, useState } from 'react';
import { makeT, type TFunction } from '../i18n';
import { useApp } from '../store/appStore';

/** Current time, re-rendering every `intervalMs` (and when the page becomes visible again). */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs, enabled]);
  return now;
}

export function useT(): TFunction {
  const lang = useApp((s) => s.settings.language);
  return useMemo(() => makeT(lang), [lang]);
}

export function useSettings() {
  return useApp((s) => s.settings);
}
