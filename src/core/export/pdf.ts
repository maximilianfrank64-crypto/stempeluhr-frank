import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
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

/** The built-in PDF fonts only cover WinAnsi; map the few typographic chars we use. */
export function pdfSafe(s: string): string {
  return s.replace(/\u2212/g, '-').replace(/[\u202F\u00A0]/g, ' ');
}

const ACCENT: [number, number, number] = [15, 23, 42];

/** Clean A4 report: entries grouped by day, weekly + monthly totals, grand total, page numbers. */
export function buildPdf(report: Report, ctx: ExportContext): Uint8Array {
  const l = ctx.labels;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const s = (v: string | number) => pdfSafe(String(v));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(s(l.title), margin, 56);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(s(`${l.period}: ${rangeText(report, ctx)}`), margin, 74);
  doc.setTextColor(0);

  const base = {
    margin: { left: margin, right: margin, bottom: 50 },
    styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' as const },
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [245, 246, 248] as [number, number, number] },
  };
  let y = 104;
  const after = () =>
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 22;
  const heading = (text: string) => {
    if (y > doc.internal.pageSize.getHeight() - 100) {
      doc.addPage();
      y = 56;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(s(text), margin, y);
    doc.setFont('helvetica', 'normal');
    y += 8;
  };

  heading(l.entries);
  const rows = flatRows(report, ctx);
  autoTable(doc, {
    ...base,
    startY: y,
    head: [[l.date, l.start, l.end, l.breaks, l.worked, l.dayTotal, l.note, l.dayNote].map(s)],
    body: rows.length
      ? rows.map((r) =>
          [
            `${r.weekday} ${r.date}`,
            r.start,
            r.end,
            r.breaks,
            r.worked,
            r.dayTotal,
            r.note,
            r.dayNote,
          ].map(s),
        )
      : [[{ content: s(l.noData), colSpan: 8 }]],
    columnStyles: {
      0: { cellWidth: 72 },
      5: { fontStyle: 'bold' },
      6: { cellWidth: 'auto' },
    },
  });
  y = after();

  const totalsTable = (title: string, label: string, body: string[][], foot?: string[]) => {
    heading(title);
    autoTable(doc, {
      ...base,
      startY: y,
      head: [[label, ...totalsHeader(report, ctx)].map(s)],
      body: body.map((r) => r.map(s)),
      // Grand total as the last table's footer, so its columns line up.
      foot: foot ? [foot.map(s)] : undefined,
      footStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold', fontSize: 10 },
      showFoot: 'lastPage',
    });
    y = after();
  };
  totalsTable(
    l.weeklyTotals,
    l.week,
    report.weeks
      .filter((w) => w.shiftCount > 0)
      .map((w) => [periodLabel(w, 'week', ctx), ...totalsCells(w, report, ctx)]),
  );
  totalsTable(
    l.monthlyTotals,
    l.month,
    report.months
      .filter((m) => m.shiftCount > 0)
      .map((m) => [periodLabel(m, 'month', ctx), ...totalsCells(m, report, ctx)]),
    [l.total, ...totalsCells(report.total, report, ctx)],
  );

  doc.setFontSize(8);
  doc.setTextColor(110);
  const notes = [
    ...footnotes(report, ctx),
    `${l.generated}: ${formatDateLong(report.generatedAt, ctx.lang)} ${formatTime(report.generatedAt, ctx.timeFormat)}`,
  ];
  const pageW = doc.internal.pageSize.getWidth();
  for (const n of notes) {
    const lines = doc.splitTextToSize(s(n), pageW - margin * 2) as string[];
    if (y + lines.length * 10 > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      y = 56;
    }
    doc.text(lines, margin, y);
    y += lines.length * 10 + 2;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`${i} / ${pages}`, pageW - margin, doc.internal.pageSize.getHeight() - 24, {
      align: 'right',
    });
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
