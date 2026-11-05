import { describe, expect, it } from 'vitest';
import { recentAddresses } from './addresses';
import type { DayNote } from './types';

const note = (date: string, address?: string): DayNote => ({
  date,
  text: 'x',
  ...(address !== undefined && { address }),
  updatedAt: 0,
});
const byDate = (...n: DayNote[]) => Object.fromEntries(n.map((x) => [x.date, x]));

describe('recentAddresses', () => {
  it('lists the newest address first, each address once', () => {
    const notes = byDate(
      note('2026-11-02', 'Rohrer Straße 85, Stuttgart'),
      note('2026-11-03', 'Orakelstraße 85, Stuttgart'),
      note('2026-11-04', 'Orakelstraße 85, Stuttgart'),
      note('2026-11-05', 'Orakelstraße 85,  stuttgart'),
    );
    expect(recentAddresses(notes)).toEqual([
      'Orakelstraße 85,  stuttgart',
      'Rohrer Straße 85, Stuttgart',
    ]);
  });

  it('skips days without an address and respects the limit', () => {
    const notes = byDate(
      note('2026-11-01', 'A 1'),
      note('2026-11-02', 'B 2'),
      note('2026-11-03'),
      note('2026-11-04', '  '),
      note('2026-11-05', 'C 3'),
    );
    expect(recentAddresses(notes, 2)).toEqual(['C 3', 'B 2']);
    expect(recentAddresses({})).toEqual([]);
  });
});
