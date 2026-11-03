import { describe, expect, it } from 'vitest';
import { HOUR, MIN, at, shift } from '../test/helpers';
import { autoBreakDeduction, calcShift, mergedLength } from './calc';

const opts = (now = at(2026, 10, 14, 20)) => ({ useRaw: false, now });

describe('calcShift', () => {
  it('net = gross - breaks', () => {
    const s = shift(at(2026, 10, 14, 8), at(2026, 10, 14, 17), [
      [at(2026, 10, 14, 12), at(2026, 10, 14, 12, 30)],
    ]);
    const c = calcShift(s, opts());
    expect(c.grossMs).toBe(9 * HOUR);
    expect(c.breakMs).toBe(30 * MIN);
    expect(c.netMs).toBe(8.5 * HOUR);
  });

  it('running shift and running break use now', () => {
    const s = shift(at(2026, 10, 14, 8), null, [[at(2026, 10, 14, 12), null]]);
    const c = calcShift(s, opts(at(2026, 10, 14, 12, 20)));
    expect(c.running).toBe(true);
    expect(c.grossMs).toBe(4 * HOUR + 20 * MIN);
    expect(c.breakMs).toBe(20 * MIN);
    expect(c.netMs).toBe(4 * HOUR);
  });

  it('uses raw times when asked', () => {
    const s = shift(at(2026, 10, 14, 8), at(2026, 10, 14, 16));
    s.start = { raw: at(2026, 10, 14, 7, 47), rounded: at(2026, 10, 14, 7, 45) };
    expect(calcShift(s, opts()).grossMs).toBe(8 * HOUR + 15 * MIN);
    expect(calcShift(s, { ...opts(), useRaw: true }).grossMs).toBe(8 * HOUR + 13 * MIN);
  });

  it('overlapping and out-of-range breaks are merged and clamped', () => {
    const s = shift(at(2026, 10, 14, 8), at(2026, 10, 14, 12), [
      [at(2026, 10, 14, 7), at(2026, 10, 14, 8, 30)], // starts before shift
      [at(2026, 10, 14, 8, 15), at(2026, 10, 14, 9)], // overlaps the first
      [at(2026, 10, 14, 11, 30), at(2026, 10, 14, 13)], // ends after shift
    ]);
    const c = calcShift(s, opts());
    expect(c.recordedBreakMs).toBe(60 * MIN + 30 * MIN);
    expect(c.netMs).toBe(4 * HOUR - 90 * MIN);
  });

  it('never negative', () => {
    const s = shift(at(2026, 10, 14, 8), at(2026, 10, 14, 8));
    expect(calcShift(s, opts()).netMs).toBe(0);
  });

  it('DST: an overnight shift across fall-back is 1h longer in real time', () => {
    // 2026-10-25 03:00 CEST → 02:00 CET
    const s = shift(at(2026, 10, 24, 22), at(2026, 10, 25, 6));
    expect(calcShift(s, opts(at(2026, 10, 26))).grossMs).toBe(9 * HOUR);
  });
});

describe('auto break', () => {
  const rule = { enabled: true, minutes: 30, afterHours: 6 };
  it('deducts the missing minimum only above the threshold', () => {
    expect(autoBreakDeduction(6 * HOUR, 0, rule)).toBe(0);
    expect(autoBreakDeduction(6 * HOUR + 1, 0, rule)).toBe(30 * MIN);
    expect(autoBreakDeduction(8 * HOUR, 20 * MIN, rule)).toBe(10 * MIN);
    expect(autoBreakDeduction(8 * HOUR, 45 * MIN, rule)).toBe(0);
    expect(autoBreakDeduction(8 * HOUR, 0, { ...rule, enabled: false })).toBe(0);
  });

  it('is applied in calcShift', () => {
    const s = shift(at(2026, 10, 14, 8), at(2026, 10, 14, 17), [
      [at(2026, 10, 14, 12), at(2026, 10, 14, 12, 10)],
    ]);
    const c = calcShift(s, { ...opts(), autoBreak: rule });
    expect(c.recordedBreakMs).toBe(10 * MIN);
    expect(c.autoBreakMs).toBe(20 * MIN);
    expect(c.netMs).toBe(8.5 * HOUR);
  });
});

describe('mergedLength', () => {
  it('merges touching and nested intervals', () => {
    expect(
      mergedLength([
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 2, end: 5 },
        { start: 30, end: 31 },
      ]),
    ).toBe(21);
  });
});
