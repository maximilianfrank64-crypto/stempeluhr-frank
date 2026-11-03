import * as XLSX from 'xlsx';
import { hoursDecimal } from '../format';
import type { PeriodReport, Report } from '../report';
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

function sheet(rows: (string | number)[][], widths: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  return ws;
}

function periodRows(
  periods: PeriodReport[],
  kind: 'week' | 'month',
  report: Report,
  ctx: ExportContext,
): (string | number)[][] {
  const l = ctx.labels;
  const rows: (string | number)[][] = [
    [kind === 'week' ? l.week : l.month, l.hoursDecimal, ...totalsHeader(report, ctx)],
  ];
  for (const p of periods.filter((p) => p.shiftCount > 0)) {
    rows.push([periodLabel(p, kind, ctx), hoursDecimal(p.netMs), ...totalsCells(p, report, ctx)]);
  }
  return rows;
}

/** Workbook with sheets: entries, weekly totals, monthly totals. Decimal hours are real numbers. */
export function buildXlsx(report: Report, ctx: ExportContext): Uint8Array {
  const l = ctx.labels;
  const wb = XLSX.utils.book_new();

  const entries: (string | number)[][] = [
    [l.title],
    [l.period, rangeText(report, ctx)],
    [],
    entryHeader(ctx),
    ...flatRows(report, ctx).map(entryCells),
    [],
    [l.total, '', '', '', '', '', hoursDecimal(report.total.netMs)],
  ];
  XLSX.utils.book_append_sheet(
    wb,
    sheet(entries, [12, 6, 10, 14, 9, 9, 9, 10, 40]),
    safeName(l.entries),
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet(periodRows(report.weeks, 'week', report, ctx), [36, 10, 10, 10, 8, 10, 10, 12]),
    safeName(l.weeklyTotals),
  );
  const months = periodRows(report.months, 'month', report, ctx);
  months.push(
    [],
    [l.total, hoursDecimal(report.total.netMs), ...totalsCells(report.total, report, ctx)],
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet(months, [20, 10, 10, 10, 8, 10, 10, 12]),
    safeName(l.monthlyTotals),
  );

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
  return new Uint8Array(out);
}

/** Excel sheet names: max 31 chars, no []:*?/\ */
function safeName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
}
