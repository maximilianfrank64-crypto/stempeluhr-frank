import { format } from 'date-fns';
import { dayStart } from './periods';
import type { DurationStyle, Language, TimeFormat } from './types';

const MINUTE = 60_000;

export const localeTag = (lang: Language) => (lang === 'de' ? 'de-DE' : 'en-US');

/**
 * Duration as h:mm ("7:45") or decimal hours ("7.75" / "7,75").
 * Minutes are floored so a running timer never shows a minute that hasn't passed.
 */
export function formatDuration(
  ms: number,
  style: DurationStyle = 'hm',
  opts: { lang?: Language; signed?: boolean } = {},
): string {
  const neg = ms < 0;
  const abs = Math.abs(ms);
  const sign = neg ? '\u2212' : opts.signed && abs > 0 ? '+' : '';
  if (style === 'decimal') {
    const h = Math.round((abs / 3_600_000) * 100) / 100;
    const s = h.toFixed(2);
    return sign + (opts.lang === 'de' ? s.replace('.', ',') : s);
  }
  const totalMin = Math.floor(abs / MINUTE);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

/** Running clock with seconds, e.g. 3:07:42. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Decimal hours as a number, e.g. for spreadsheets. */
export function hoursDecimal(ms: number): number {
  return Math.round((ms / 3_600_000) * 100) / 100;
}

export function formatTime(ms: number, timeFormat: TimeFormat): string {
  return format(ms, timeFormat === '12h' ? 'h:mm a' : 'HH:mm');
}

/** Short date: 14.10.2026 / 10/14/2026. */
export function formatDate(msOrKey: number | string, lang: Language): string {
  const ms = typeof msOrKey === 'string' ? dayStart(msOrKey) : msOrKey;
  return new Intl.DateTimeFormat(localeTag(lang), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms);
}

/** Long date with weekday: "Wednesday, October 14, 2026". */
export function formatDateLong(msOrKey: number | string, lang: Language): string {
  const ms = typeof msOrKey === 'string' ? dayStart(msOrKey) : msOrKey;
  return new Intl.DateTimeFormat(localeTag(lang), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(ms);
}

/** Weekday + day: "Wed, Oct 14". */
export function formatDayShort(msOrKey: number | string, lang: Language): string {
  const ms = typeof msOrKey === 'string' ? dayStart(msOrKey) : msOrKey;
  return new Intl.DateTimeFormat(localeTag(lang), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(ms);
}

export function formatMonth(monthKeyOrMs: string | number, lang: Language): string {
  const ms = typeof monthKeyOrMs === 'string' ? dayStart(`${monthKeyOrMs}-01`) : monthKeyOrMs;
  return new Intl.DateTimeFormat(localeTag(lang), { year: 'numeric', month: 'long' }).format(ms);
}

/** Two dates on different calendar days? Used to mark "+1 day" for overnight shifts. */
export function crossesMidnight(start: number, end: number): boolean {
  return format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd');
}
