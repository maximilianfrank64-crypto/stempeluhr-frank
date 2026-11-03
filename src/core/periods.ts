import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getWeek,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import type { DateRange, RangePreset, WeekDay } from './types';

/** Local calendar day key, yyyy-MM-dd. */
export function dayKey(ms: number): string {
  return format(ms, 'yyyy-MM-dd');
}

/** Local midnight of a day key, as epoch ms. */
export function dayStart(key: string): number {
  return parse(key, 'yyyy-MM-dd', new Date(2000, 0, 1)).getTime();
}

/** Local midnight of the day after `key` (handles 23/25 hour DST days). */
export function dayEnd(key: string): number {
  return addDays(dayStart(key), 1).getTime();
}

export function isValidDayKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const ms = dayStart(key);
  return !Number.isNaN(ms) && dayKey(ms) === key;
}

export function monthKey(ms: number): string {
  return format(ms, 'yyyy-MM');
}

/** Week key = day key of the first day of that week. */
export function weekKey(ms: number, weekStartsOn: WeekDay): string {
  return dayKey(startOfWeek(ms, { weekStartsOn }).getTime());
}

/** Week number. Monday-start weeks use ISO-8601 numbering, others US-style. */
export function weekNumber(ms: number, weekStartsOn: WeekDay): number {
  return getWeek(ms, { weekStartsOn, firstWeekContainsDate: weekStartsOn === 1 ? 4 : 1 });
}

export function dayKeysInRange(range: DateRange): string[] {
  const from = dayStart(range.from);
  const to = dayStart(range.to);
  if (to < from) return [];
  return eachDayOfInterval({ start: from, end: to }).map((d) => dayKey(d.getTime()));
}

export function presetRange(
  preset: RangePreset,
  now: number,
  weekStartsOn: WeekDay,
  opts: { custom?: DateRange; firstDataMs?: number } = {},
): DateRange {
  const opt = { weekStartsOn };
  const r = (a: Date | number, b: Date | number): DateRange => ({
    from: dayKey(+a),
    to: dayKey(+b),
  });
  switch (preset) {
    case 'today':
      return r(now, now);
    case 'thisWeek':
      return r(startOfWeek(now, opt), endOfWeek(now, opt));
    case 'lastWeek': {
      const d = addWeeks(now, -1);
      return r(startOfWeek(d, opt), endOfWeek(d, opt));
    }
    case 'thisMonth':
      return r(startOfMonth(now), endOfMonth(now));
    case 'lastMonth': {
      const d = addMonths(now, -1);
      return r(startOfMonth(d), endOfMonth(d));
    }
    case 'thisYear':
      return r(startOfYear(now), endOfYear(now));
    case 'all':
      return r(startOfDay(opts.firstDataMs ?? now), now);
    case 'custom':
      return opts.custom ?? r(now, now);
  }
}

export type PeriodUnit = 'day' | 'week' | 'month';

/** The range of the day/week/month containing `ms`. */
export function periodRange(unit: PeriodUnit, ms: number, weekStartsOn: WeekDay): DateRange {
  if (unit === 'day') return { from: dayKey(ms), to: dayKey(ms) };
  if (unit === 'week')
    return {
      from: dayKey(+startOfWeek(ms, { weekStartsOn })),
      to: dayKey(+endOfWeek(ms, { weekStartsOn })),
    };
  return { from: dayKey(+startOfMonth(ms)), to: dayKey(+endOfMonth(ms)) };
}

/** Move a reference date by n days/weeks/months. */
export function shiftPeriod(unit: PeriodUnit, ms: number, n: number): number {
  if (unit === 'day') return addDays(ms, n).getTime();
  if (unit === 'week') return addWeeks(ms, n).getTime();
  return addMonths(ms, n).getTime();
}
