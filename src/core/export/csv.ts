import type { Report } from '../report';
import {
  entryCells,
  entryHeader,
  flatRows,
  periodLabel,
  rangeText,
  totalsCells,
  totalsHeader,
  type ExportContext,
} from './context';

export function csvEscape(value: string | number, sep: string): string {
  const s = String(value);
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV with a header block, one row per shift, then weekly, monthly and grand totals.
 * German exports use ';' and decimal commas so Excel opens them correctly.
 * Starts with a UTF-8 BOM so Excel detects the encoding (umlauts).
 */
export function buildCsv(report: Report, ctx: ExportContext): string {
  const sep = ctx.lang === 'de' ? ';' : ',';
  const l = ctx.labels;
  const lines: (string | number)[][] = [];
  const num = (n: number | '') => (n !== '' && ctx.lang === 'de' ? String(n).replace('.', ',') : n);

  lines.push([l.title], [l.period, rangeText(report, ctx)], []);
  lines.push(entryHeader(ctx));
  for (const r of flatRows(report, ctx)) {
    const cells = entryCells(r);
    cells[6] = num(r.hours);
    lines.push(cells);
  }

  lines.push([], [l.weeklyTotals], [l.week, ...totalsHeader(report, ctx)]);
  for (const w of report.weeks.filter((w) => w.shiftCount > 0)) {
    lines.push([periodLabel(w, 'week', ctx), ...totalsCells(w, report, ctx)]);
  }
  lines.push([], [l.monthlyTotals], [l.month, ...totalsHeader(report, ctx)]);
  for (const m of report.months.filter((m) => m.shiftCount > 0)) {
    lines.push([periodLabel(m, 'month', ctx), ...totalsCells(m, report, ctx)]);
  }
  lines.push([], [l.total, ...totalsCells(report.total, report, ctx)]);

  return (
    '\uFEFF' +
    lines.map((cells) => cells.map((c) => csvEscape(c, sep)).join(sep)).join('\r\n') +
    '\r\n'
  );
}
