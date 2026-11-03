import { calcShift, type Interval } from './calc';
import { dayEnd, dayKey, dayKeysInRange, dayStart, monthKey, weekKey, weekNumber } from './periods';
import { stampTime } from './rounding';
import type { DateRange, Settings, Shift } from './types';

export interface ShiftRow {
  id: string;
  start: number;
  /** null when the shift is still running. */
  end: number | null;
  breaks: Interval[];
  breakMs: number;
  autoBreakMs: number;
  netMs: number;
  note: string;
  /** Raw times, kept for transparency (e.g. "rounded from 07:47"). */
  rawStart: number;
  rawEnd: number | null;
}

/** Plain sums; targets and overtime are worked out in the office, not in the app. */
export interface Totals {
  netMs: number;
  breakMs: number;
  grossMs: number;
  shiftCount: number;
}

export interface DayReport extends Totals {
  date: string;
  shifts: ShiftRow[];
  /** Optional free-text note for the whole day ('' if none). */
  note: string;
}

export interface PeriodReport extends Totals {
  /** Week: first day of week (yyyy-MM-dd). Month: yyyy-MM. */
  key: string;
  /** Week number (weeks only). */
  week?: number;
  from: string;
  to: string;
}

export interface Report {
  range: DateRange;
  generatedAt: number;
  useRaw: boolean;
  days: DayReport[];
  /** Days that have shifts or a day note (for listings and exports). */
  listedDays: DayReport[];
  weeks: PeriodReport[];
  months: PeriodReport[];
  total: Totals;
}

/** A shift belongs to the local day on which it starts. */
export function shiftDayKey(shift: Shift, useRaw: boolean): string {
  return dayKey(stampTime(shift.start, useRaw));
}

export function shiftsInRange(shifts: Shift[], range: DateRange, useRaw: boolean): Shift[] {
  const from = dayStart(range.from);
  const to = dayEnd(range.to);
  return shifts
    .filter((s) => {
      const t = stampTime(s.start, useRaw);
      return t >= from && t < to;
    })
    .sort((a, b) => stampTime(a.start, useRaw) - stampTime(b.start, useRaw));
}

function emptyTotals(): Totals {
  return { netMs: 0, breakMs: 0, grossMs: 0, shiftCount: 0 };
}

function addInto(into: Totals, t: Totals) {
  into.netMs += t.netMs;
  into.breakMs += t.breakMs;
  into.grossMs += t.grossMs;
  into.shiftCount += t.shiftCount;
}

export function buildReport(
  allShifts: Shift[],
  range: DateRange,
  settings: Settings,
  now: number,
  /** Day notes keyed by yyyy-MM-dd. */
  dayNotes: Readonly<Record<string, { text: string }>> = {},
): Report {
  // Exact clock times only: the company app does not round.
  const useRaw = true;
  const calcOpts = { useRaw, now, autoBreak: settings.autoBreak };
  const byDay = new Map<string, ShiftRow[]>();

  for (const s of shiftsInRange(allShifts, range, useRaw)) {
    const c = calcShift(s, calcOpts);
    const row: ShiftRow = {
      id: s.id,
      start: c.start,
      end: c.running ? null : c.end,
      breaks: c.breaks,
      breakMs: c.breakMs,
      autoBreakMs: c.autoBreakMs,
      netMs: c.netMs,
      note: s.note,
      rawStart: s.start.raw,
      rawEnd: s.end ? s.end.raw : null,
    };
    const key = dayKey(c.start);
    const list = byDay.get(key) ?? [];
    list.push(row);
    byDay.set(key, list);
  }

  const days: DayReport[] = dayKeysInRange(range).map((date) => {
    const shifts = byDay.get(date) ?? [];
    const t = emptyTotals();
    for (const r of shifts) {
      const end = r.end ?? now;
      t.netMs += r.netMs;
      t.breakMs += r.breakMs;
      t.grossMs += Math.max(0, end - r.start);
      t.shiftCount += 1;
    }
    return { date, shifts, note: dayNotes[date]?.text.trim() ?? '', ...t };
  });

  const weeks = groupPeriods(days, (d) => weekKey(dayStart(d.date), settings.weekStartsOn));
  for (const w of weeks) w.week = weekNumber(dayStart(w.key), settings.weekStartsOn);
  const months = groupPeriods(days, (d) => monthKey(dayStart(d.date)));
  const total = emptyTotals();
  for (const w of weeks) addInto(total, w);

  return {
    range,
    generatedAt: now,
    useRaw,
    days,
    listedDays: days.filter((d) => d.shiftCount > 0 || d.note !== ''),
    weeks,
    months,
    total,
  };
}

function groupPeriods(days: DayReport[], keyOf: (d: DayReport) => string): PeriodReport[] {
  const out: PeriodReport[] = [];
  let cur: PeriodReport | undefined;
  for (const d of days) {
    const key = keyOf(d);
    if (!cur || cur.key !== key) {
      cur = { key, from: d.date, to: d.date, ...emptyTotals() };
      out.push(cur);
    }
    cur.to = d.date;
    addInto(cur, d);
  }
  return out;
}
