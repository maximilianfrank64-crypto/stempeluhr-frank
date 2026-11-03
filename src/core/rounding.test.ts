import { describe, expect, it } from 'vitest';
import { at, hm } from '../test/helpers';
import { makeStamp, roundTime } from './rounding';
import type { RoundingRule } from './types';

const nearest15: RoundingRule = { mode: 'nearest', interval: 15 };
const up15: RoundingRule = { mode: 'up', interval: 15 };
const down15: RoundingRule = { mode: 'down', interval: 15 };

describe('roundTime – required examples', () => {
  it('punch in 7:47, nearest 15 → 7:45', () => {
    expect(hm(roundTime(at(2026, 10, 14, 7, 47), nearest15))).toBe('07:45');
  });
  it('punch out 15:55, nearest 15 → 16:00', () => {
    expect(hm(roundTime(at(2026, 10, 14, 15, 55), nearest15))).toBe('16:00');
  });
  it('up 15: 7:46 → 8:00', () => {
    expect(hm(roundTime(at(2026, 10, 14, 7, 46), up15))).toBe('08:00');
  });
  it('down 15: 7:59 → 7:45', () => {
    expect(hm(roundTime(at(2026, 10, 14, 7, 59), down15))).toBe('07:45');
  });
});

describe('roundTime – general', () => {
  it('off returns the input unchanged (including seconds)', () => {
    const t = at(2026, 10, 14, 7, 47, 31);
    expect(roundTime(t, { mode: 'off', interval: 15 })).toBe(t);
  });

  it('exact grid times are unchanged in every mode', () => {
    const t = at(2026, 10, 14, 7, 45);
    for (const mode of ['nearest', 'up', 'down'] as const) {
      expect(roundTime(t, { mode, interval: 15 })).toBe(t);
    }
  });

  it('nearest rounds the exact half up (7:52:30 → 8:00)', () => {
    expect(hm(roundTime(at(2026, 10, 14, 7, 52, 30), nearest15))).toBe('08:00');
    expect(hm(roundTime(at(2026, 10, 14, 7, 52, 29), nearest15))).toBe('07:45');
  });

  it('up rounds even one second past the grid', () => {
    expect(hm(roundTime(at(2026, 10, 14, 7, 45, 1), up15))).toBe('08:00');
  });

  it('1 minute interval drops seconds sensibly', () => {
    expect(roundTime(at(2026, 10, 14, 7, 47, 31), { mode: 'nearest', interval: 1 })).toBe(
      at(2026, 10, 14, 7, 48),
    );
    expect(roundTime(at(2026, 10, 14, 7, 47, 31), { mode: 'down', interval: 1 })).toBe(
      at(2026, 10, 14, 7, 47),
    );
  });

  it.each([
    [5, '07:45'],
    [6, '07:48'],
    [10, '07:50'],
    [30, '08:00'],
    [60, '08:00'],
  ])('nearest %i min: 7:47 → %s', (interval, expected) => {
    expect(hm(roundTime(at(2026, 10, 14, 7, 47), { mode: 'nearest', interval }))).toBe(expected);
  });

  it('supports custom intervals on a grid from midnight (7 min: 7:47 → 7:49)', () => {
    // 7:47 = 467 min; 467/7 = 66.7 → 67*7 = 469 = 7:49
    expect(hm(roundTime(at(2026, 10, 14, 7, 47), { mode: 'nearest', interval: 7 }))).toBe('07:49');
  });

  it('clamps nonsense intervals', () => {
    const t = at(2026, 10, 14, 7, 47, 20);
    expect(roundTime(t, { mode: 'down', interval: 0 })).toBe(at(2026, 10, 14, 7, 47));
  });
});

describe('roundTime – midnight', () => {
  it('rounds 23:53 (nearest 15) to 00:00 of the next day', () => {
    expect(roundTime(at(2026, 10, 14, 23, 53), nearest15)).toBe(at(2026, 10, 15, 0, 0));
  });
  it('rounds 23:46 up to next-day midnight', () => {
    expect(roundTime(at(2026, 10, 14, 23, 46), up15)).toBe(at(2026, 10, 15, 0, 0));
  });
  it('rounds 00:07 down to the same day midnight', () => {
    expect(roundTime(at(2026, 10, 15, 0, 7), down15)).toBe(at(2026, 10, 15, 0, 0));
  });
  it('60 min nearest at 23:31 → next day 00:00', () => {
    expect(roundTime(at(2026, 10, 14, 23, 31), { mode: 'nearest', interval: 60 })).toBe(
      at(2026, 10, 15, 0, 0),
    );
  });
});

describe('roundTime – DST (Europe/Berlin)', () => {
  // 2026-03-29: clocks jump 02:00 → 03:00. 2026-10-25: 03:00 → 02:00.
  it('spring forward: 01:55 up 15 lands on 03:00 (02:00 does not exist), 5 real minutes later', () => {
    const t = at(2026, 3, 29, 1, 55);
    const r = roundTime(t, up15);
    expect(hm(r)).toBe('03:00');
    expect(r - t).toBe(5 * 60_000);
  });

  it('spring forward: 03:07 nearest 15 → 03:00', () => {
    expect(hm(roundTime(at(2026, 3, 29, 3, 7), nearest15))).toBe('03:00');
  });

  it('fall back: rounding in the repeated hour stays in that hour', () => {
    // 02:10 during the *second* (CET) occurrence: 00:00Z + 1h + 70min = 01:10Z
    const secondOccurrence = Date.UTC(2026, 9, 25, 1, 10);
    expect(hm(secondOccurrence)).toBe('02:10');
    const r = roundTime(secondOccurrence, down15);
    expect(hm(r)).toBe('02:00');
    expect(secondOccurrence - r).toBe(10 * 60_000);

    const firstOccurrence = Date.UTC(2026, 9, 25, 0, 10); // 02:10 CEST
    expect(firstOccurrence - roundTime(firstOccurrence, down15)).toBe(10 * 60_000);
  });

  it('fall back: up/nearest never move by more than the interval', () => {
    for (let m = 0; m < 180; m += 7) {
      const t = Date.UTC(2026, 9, 24, 23, 0) + m * 60_000;
      for (const rule of [nearest15, up15, down15]) {
        const r = roundTime(t, rule);
        expect(Math.abs(r - t)).toBeLessThanOrEqual(15 * 60_000);
        if (rule.mode === 'up') expect(r).toBeGreaterThanOrEqual(t);
        if (rule.mode === 'down') expect(r).toBeLessThanOrEqual(t);
      }
    }
  });
});

describe('makeStamp', () => {
  it('stores both raw and rounded', () => {
    const t = at(2026, 10, 14, 7, 47, 12);
    expect(makeStamp(t, nearest15)).toEqual({ raw: t, rounded: at(2026, 10, 14, 7, 45) });
  });
});
