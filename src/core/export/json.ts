import { hoursDecimal } from '../format';
import type { Report, Totals } from '../report';

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

function totals(t: Totals) {
  return {
    workedHours: hoursDecimal(t.netMs),
    breakHours: hoursDecimal(t.breakMs),
    shiftCount: t.shiftCount,
  };
}

/** Machine-readable report. Times are ISO-8601 UTC; durations in decimal hours and minutes. */
export function buildJson(report: Report): string {
  const data = {
    format: 'punch-clock-report',
    version: 1,
    generatedAt: iso(report.generatedAt),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    range: report.range,
    times: report.useRaw ? 'raw' : 'rounded',
    days: report.listedDays.map((d) => ({
      date: d.date,
      note: d.note,
      ...totals(d),
      shifts: d.shifts.map((s) => ({
        id: s.id,
        start: iso(s.start),
        end: iso(s.end),
        rawStart: iso(s.rawStart),
        rawEnd: iso(s.rawEnd),
        breaks: s.breaks.map((b) => ({ start: iso(b.start), end: iso(b.end) })),
        breakMinutes: Math.round(s.breakMs / 60_000),
        autoBreakMinutes: Math.round(s.autoBreakMs / 60_000),
        workedMinutes: Math.round(s.netMs / 60_000),
        workedHours: hoursDecimal(s.netMs),
        note: s.note,
      })),
    })),
    weeks: report.weeks.map((w) => ({ week: w.week, from: w.from, to: w.to, ...totals(w) })),
    months: report.months.map((m) => ({ month: m.key, from: m.from, to: m.to, ...totals(m) })),
    total: totals(report.total),
  };
  return JSON.stringify(data, null, 2);
}
