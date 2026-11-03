import { stampTime } from './rounding';
import type { AutoBreakSettings, Shift } from './types';

const HOUR = 3_600_000;
const MINUTE = 60_000;

export interface CalcOptions {
  /** Use raw clock times instead of rounded ones. */
  useRaw: boolean;
  /** "Now", used as the end of a running shift / break. */
  now: number;
  autoBreak?: AutoBreakSettings;
}

export interface Interval {
  start: number;
  end: number;
}

export interface ShiftCalc {
  start: number;
  /** Effective end (now for running shifts). */
  end: number;
  running: boolean;
  grossMs: number;
  /** Breaks actually recorded (clamped to the shift, overlaps merged). */
  recordedBreakMs: number;
  /** Extra deduction from the automatic break rule. */
  autoBreakMs: number;
  /** recordedBreakMs + autoBreakMs */
  breakMs: number;
  netMs: number;
  breaks: Interval[];
}

/** Merge overlapping intervals and return total covered length. */
export function mergedLength(intervals: Interval[]): number {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const i of sorted) {
    if (i.start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = i.start;
      curEnd = i.end;
    } else {
      curEnd = Math.max(curEnd, i.end);
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

/**
 * Automatic break rule: once a shift is longer than `afterHours`, the total
 * break must be at least `minutes`. Only the missing part is deducted, so
 * breaks you already logged count towards it (no double deduction).
 */
export function autoBreakDeduction(
  grossMs: number,
  recordedBreakMs: number,
  rule: AutoBreakSettings | undefined,
): number {
  if (!rule?.enabled) return 0;
  if (grossMs <= rule.afterHours * HOUR) return 0;
  return Math.max(0, rule.minutes * MINUTE - recordedBreakMs);
}

export function calcShift(shift: Shift, opts: CalcOptions): ShiftCalc {
  const running = shift.end === null;
  const start = stampTime(shift.start, opts.useRaw);
  const end = shift.end ? stampTime(shift.end, opts.useRaw) : Math.max(start, opts.now);
  const grossMs = Math.max(0, end - start);

  const breaks: Interval[] = shift.breaks.map((b) => {
    const bs = Math.min(end, Math.max(start, stampTime(b.start, opts.useRaw)));
    const be = b.end ? stampTime(b.end, opts.useRaw) : opts.now;
    return { start: bs, end: Math.min(end, Math.max(bs, be)) };
  });
  const recordedBreakMs = Math.min(grossMs, mergedLength(breaks));
  const autoBreakMs = Math.min(
    grossMs - recordedBreakMs,
    autoBreakDeduction(grossMs, recordedBreakMs, opts.autoBreak),
  );
  const breakMs = recordedBreakMs + autoBreakMs;
  return {
    start,
    end,
    running,
    grossMs,
    recordedBreakMs,
    autoBreakMs,
    breakMs,
    netMs: Math.max(0, grossMs - breakMs),
    breaks,
  };
}
