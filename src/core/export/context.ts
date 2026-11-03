import {
  crossesMidnight,
  formatDate,
  formatDuration,
  formatMonth,
  formatTime,
  hoursDecimal,
} from '../format';
import type { PeriodReport, Report, Totals } from '../report';
import type { DurationStyle, Language, TimeFormat } from '../types';

/** All user-visible words used in exports, supplied by the i18n layer. */
export interface ExportLabels {
  title: string;
  period: string;
  generated: string;
  date: string;
  weekday: string;
  start: string;
  end: string;
  breaks: string;
  worked: string;
  hoursDecimal: string;
  dayTotal: string;
  note: string;
  dayNote: string;
  week: string;
  month: string;
  total: string;
  shifts: string;
  weeklyTotals: string;
  monthlyTotals: string;
  entries: string;
  running: string;
  rawTimesNote: string;
  roundedTimesNote: string;
  autoBreakNote: string;
  nextDay: string;
  noData: string;
}

export interface ExportContext {
  lang: Language;
  timeFormat: TimeFormat;
  durationStyle: DurationStyle;
  labels: ExportLabels;
}

export interface FlatRow {
  date: string;
  weekday: string;
  start: string;
  end: string;
  breaks: string;
  worked: string;
  /** '' on rows without a shift (a day that only has a note). */
  hours: number | '';
  /** Filled on the last row of each day only. */
  dayTotal: string;
  /** Shift note. */
  note: string;
  /** Day note, filled on the first row of each day only. */
  dayNote: string;
}

export const dur = (ms: number, ctx: ExportContext, signed = false) =>
  formatDuration(ms, ctx.durationStyle, { lang: ctx.lang, signed });

export function weekdayShort(key: string, lang: Language): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', { weekday: 'short' }).format(
    new Date(y, m - 1, d),
  );
}

/**
 * One row per shift, with the day total on the day's last row and the day note
 * on its first. A day with only a note gets a single row without times.
 */
export function flatRows(report: Report, ctx: ExportContext): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const day of report.listedDays) {
    const date = formatDate(day.date, ctx.lang);
    const weekday = weekdayShort(day.date, ctx.lang);
    if (day.shifts.length === 0) {
      rows.push({
        date,
        weekday,
        start: '',
        end: '',
        breaks: '',
        worked: '',
        hours: '',
        dayTotal: '',
        note: '',
        dayNote: day.note,
      });
      continue;
    }
    day.shifts.forEach((s, i) => {
      const endText =
        s.end === null
          ? ctx.labels.running
          : formatTime(s.end, ctx.timeFormat) +
            (crossesMidnight(s.start, s.end) ? ` ${ctx.labels.nextDay}` : '');
      rows.push({
        date,
        weekday,
        start: formatTime(s.start, ctx.timeFormat),
        end: endText,
        breaks: dur(s.breakMs, ctx),
        worked: dur(s.netMs, ctx),
        hours: hoursDecimal(s.netMs),
        dayTotal: i === day.shifts.length - 1 ? dur(day.netMs, ctx) : '',
        note: s.note,
        dayNote: i === 0 ? day.note : '',
      });
    });
  }
  return rows;
}

export function periodLabel(p: PeriodReport, kind: 'week' | 'month', ctx: ExportContext): string {
  if (kind === 'month') return formatMonth(p.key, ctx.lang);
  return `${ctx.labels.week} ${p.week ?? ''} (${formatDate(p.from, ctx.lang)} – ${formatDate(p.to, ctx.lang)})`;
}

/** Totals columns shared by week/month/grand total tables. */
export function totalsCells(t: Totals, _report: Report, ctx: ExportContext): string[] {
  return [dur(t.netMs, ctx), dur(t.breakMs, ctx), String(t.shiftCount)];
}

export function totalsHeader(_report: Report, ctx: ExportContext): string[] {
  const l = ctx.labels;
  return [l.worked, l.breaks, l.shifts];
}

export function rangeText(report: Report, ctx: ExportContext): string {
  return `${formatDate(report.range.from, ctx.lang)} – ${formatDate(report.range.to, ctx.lang)}`;
}

export function footnotes(report: Report, ctx: ExportContext): string[] {
  const notes = [report.useRaw ? ctx.labels.rawTimesNote : ctx.labels.roundedTimesNote];
  if (report.listedDays.some((d) => d.shifts.some((s) => s.autoBreakMs > 0))) {
    notes.push(ctx.labels.autoBreakNote);
  }
  return notes;
}

export const entryHeader = (ctx: ExportContext) => {
  const l = ctx.labels;
  return [
    l.date,
    l.weekday,
    l.start,
    l.end,
    l.breaks,
    l.worked,
    l.hoursDecimal,
    l.dayTotal,
    l.note,
    l.dayNote,
  ];
};

export const entryCells = (r: FlatRow) => [
  r.date,
  r.weekday,
  r.start,
  r.end,
  r.breaks,
  r.worked,
  r.hours,
  r.dayTotal,
  r.note,
  r.dayNote,
];

/** File name stem, e.g. timesheet_2026-10-01_2026-10-31 */
export function fileStem(report: Report): string {
  return `timesheet_${report.range.from}_${report.range.to}`;
}
