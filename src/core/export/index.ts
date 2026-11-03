import type { Report } from '../report';
import type { ExportFormat } from '../types';
import { fileStem, type ExportContext } from './context';
import { buildCsv } from './csv';
import { buildHtml } from './html';
import { buildJson } from './json';
import { buildText } from './text';

export type { ExportContext, ExportLabels } from './context';

export interface ExportFile {
  filename: string;
  mime: string;
  data: string | Uint8Array;
}

export const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  json: 'application/json',
  txt: 'text/plain',
  html: 'text/html',
};

/**
 * Build an export file. XLSX and PDF libraries are large, so they are loaded
 * on demand (separate chunks, still precached for offline use).
 */
export async function buildExport(
  format: ExportFormat,
  report: Report,
  ctx: ExportContext,
): Promise<ExportFile> {
  const filename = `${fileStem(report)}.${format}`;
  const mime = MIME[format];
  switch (format) {
    case 'csv':
      return { filename, mime, data: buildCsv(report, ctx) };
    case 'json':
      return { filename, mime, data: buildJson(report) };
    case 'txt':
      return { filename, mime, data: buildText(report, ctx) };
    case 'html':
      return { filename, mime, data: buildHtml(report, ctx) };
    case 'xlsx': {
      const { buildXlsx } = await import('./xlsx');
      return { filename, mime, data: buildXlsx(report, ctx) };
    }
    case 'pdf': {
      const { buildPdf } = await import('./pdf');
      return { filename, mime, data: buildPdf(report, ctx) };
    }
  }
}
