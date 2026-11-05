import type { DayNote } from './types';

/**
 * Quick-pick list for the address field: the job-site addresses this phone's owner typed
 * most recently, newest day first, each only once. Nothing is shared between phones and
 * nothing is stored extra: the list is read from the day notes the phone already keeps.
 */
export function recentAddresses(notes: Readonly<Record<string, DayNote>>, limit = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const days = Object.keys(notes).sort().reverse();
  for (const day of days) {
    const address = notes[day]?.address?.trim() ?? '';
    const key = address.toLowerCase().replace(/\s+/g, ' ');
    if (address === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(address);
    if (out.length >= limit) break;
  }
  return out;
}
