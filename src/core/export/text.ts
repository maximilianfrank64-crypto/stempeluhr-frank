import { formatDate } from '../format';
import type { Report } from '../report';
import {
  flatRows,
  footnotes,
  periodLabel,
  rangeText,
  totalsCells,
  totalsHeader,
  type ExportContext,
} from './context';

function table(header: string[], rows: string[][]): string[] {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => c.padEnd(widths[i] ?? 0))
      .join('  ')
      .trimEnd();
  return [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)];
}

/** Plain-text report with aligned columns (monospace), good for mail bodies and notes apps. */
export function buildText(report: Report, ctx: ExportContext): string {
  const l = ctx.labels;
  const out: string[] = [l.title, `${l.period}: ${rangeText(report, ctx)}`, ''];

  if (report.listedDays.length === 0) {
    out.push(l.noData);
  } else {
    const rows = flatRows(report, ctx).map((r) => [
      `${r.weekday} ${r.date}`,
      r.start,
      r.end,
      r.breaks,
      r.worked,
      r.dayTotal,
      r.note.replace(/\s+/g, ' '),
      r.dayNote.replace(/\s+/g, ' '),
    ]);
    out.push(
      ...table([l.date, l.start, l.end, l.breaks, l.worked, l.dayTotal, l.note, l.dayNote], rows),
    );
  }

  out.push('', l.weeklyTotals);
  out.push(
    ...table(
      [l.week, ...totalsHeader(report, ctx)],
      report.weeks
        .filter((w) => w.shiftCount > 0)
        .map((w) => [periodLabel(w, 'week', ctx), ...totalsCells(w, report, ctx)]),
    ),
  );
  out.push('', l.monthlyTotals);
  out.push(
    ...table(
      [l.month, ...totalsHeader(report, ctx)],
      report.months
        .filter((m) => m.shiftCount > 0)
        .map((m) => [periodLabel(m, 'month', ctx), ...totalsCells(m, report, ctx)]),
    ),
  );
  out.push(
    '',
    ...table(
      [l.total, ...totalsHeader(report, ctx)],
      [['', ...totalsCells(report.total, report, ctx)]],
    ),
  );
  out.push(
    '',
    ...footnotes(report, ctx),
    `${l.generated}: ${formatDate(report.generatedAt, ctx.lang)}`,
  );
  return out.join('\n') + '\n';
}
