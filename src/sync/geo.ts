import type { GeoResult } from '../core/types';

/**
 * One position fix for a punch. Never rejects: a denied permission, no signal
 * or a timeout is recorded as such, so punching always works.
 */
export function currentLocation(timeoutMs = 15_000): Promise<GeoResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ error: 'unsupported' });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          // ~10 cm precision is plenty and keeps the payload short.
          lat: Math.round(p.coords.latitude * 1e6) / 1e6,
          lon: Math.round(p.coords.longitude * 1e6) / 1e6,
          accuracyM: Math.round(p.coords.accuracy),
          at: p.timestamp,
        }),
      (e) =>
        resolve({
          error: e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable',
        }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
