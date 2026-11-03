import { formatDateLong, formatTime } from '../format';
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

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const row = (cells: (string | number)[], tag: 'td' | 'th' = 'td') =>
  `<tr>${cells.map((c) => `<${tag}>${escapeHtml(String(c))}</${tag}>`).join('')}</tr>`;

/** Self-contained, printable HTML report (no external resources). */
export function buildHtml(report: Report, ctx: ExportContext): string {
  const l = ctx.labels;
  const entries = flatRows(report, ctx)
    .map((r) =>
      row([
        `${r.weekday} ${r.date}`,
        r.start,
        r.end,
        r.breaks,
        r.worked,
        r.dayTotal,
        r.note,
        r.dayNote,
      ]),
    )
    .join('\n');
  const weeks = report.weeks
    .filter((w) => w.shiftCount > 0)
    .map((w) => row([periodLabel(w, 'week', ctx), ...totalsCells(w, report, ctx)]))
    .join('\n');
  const months = report.months
    .filter((m) => m.shiftCount > 0)
    .map((m) => row([periodLabel(m, 'month', ctx), ...totalsCells(m, report, ctx)]))
    .join('\n');

  return `<!doctype html>
<html lang="${ctx.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(l.title)} ${escapeHtml(rangeText(report, ctx))}</title>
<style>
  body { font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 24px 0 8px; }
  .meta { color: #555; margin: 0 0 16px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  td:nth-child(n+2):nth-child(-n+6) { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .total td { font-weight: 700; border-top: 2px solid #111; }
  .notes { color: #555; font-size: 12px; margin-top: 16px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>${escapeHtml(l.title)}</h1>
<p class="meta">${escapeHtml(l.period)}: ${escapeHtml(rangeText(report, ctx))}</p>
<h2>${escapeHtml(l.entries)}</h2>
${
  report.listedDays.length === 0
    ? `<p>${escapeHtml(l.noData)}</p>`
    : `<table>
<thead>${row([l.date, l.start, l.end, l.breaks, l.worked, l.dayTotal, l.note, l.dayNote], 'th')}</thead>
<tbody>
${entries}
</tbody>
</table>`
}
<h2>${escapeHtml(l.weeklyTotals)}</h2>
<table>
<thead>${row([l.week, ...totalsHeader(report, ctx)], 'th')}</thead>
<tbody>
${weeks}
</tbody>
</table>
<h2>${escapeHtml(l.monthlyTotals)}</h2>
<table>
<thead>${row([l.month, ...totalsHeader(report, ctx)], 'th')}</thead>
<tbody>
${months}
</tbody>
<tfoot class="total">${row([l.total, ...totalsCells(report.total, report, ctx)])}</tfoot>
</table>
<p class="notes">${footnotes(report, ctx).map(escapeHtml).join('<br>')}<br>${escapeHtml(l.generated)}: ${escapeHtml(formatDateLong(report.generatedAt, ctx.lang))} ${escapeHtml(formatTime(report.generatedAt, ctx.timeFormat))}</p>
</body>
</html>
`;
}
