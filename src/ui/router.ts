import { useSyncExternalStore } from 'react';

/**
 * Minimal hash router. Hash URLs work on any static host (GitHub Pages) and
 * inside an installed iOS web app without server rewrites.
 */
export const ROUTES = ['home', 'history', 'export', 'settings', 'backup', 'about'] as const;
export type Route = (typeof ROUTES)[number];

function parse(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'home';
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parse(window.location.hash));
}

export function href(route: Route): string {
  return route === 'home' ? '#/' : `#/${route}`;
}

export function navigate(route: Route): void {
  window.location.hash = href(route);
}
