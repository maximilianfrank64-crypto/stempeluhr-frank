import { describe, expect, it } from 'vitest';
import { exportLabels } from '../../i18n';
import { at, plainSettings, shift } from '../../test/helpers';
import { buildReport } from '../report';
import type { Language } from '../types';
import type { ExportContext } from './context';
import { buildCsv, csvEscape } from './csv';
import { buildHtml, escapeHtml } from './html';
import { buildExport } from './index';
import { buildJson } from './json';
import { buildText } from './text';

const NOW = at(2026, 10, 16, 20);
const data = [
  shift(
    at(2026, 10, 12, 8),
    at(2026, 10, 12, 16, 30),
    [[at(2026, 10, 12, 12), at(2026, 10, 12, 12, 30)]],
    {
      note: 'Client "A", on-site; <b>',
    },
  ),
  shift(at(2026, 10, 13, 22), at(2026, 10, 14, 2)),
];
const settings = plainSettings({ timeFormat: '24h' });
const report = buildReport(data, { from: '2026-10-12', to: '2026-10-18' }, settings, NOW);
const ctx = (lang: Language = 'en'): ExportContext => ({
  lang,
  timeFormat: '24h',
  durationStyle: 'hm',
  labels: exportLabels(lang),
});

describe('CSV', () => {
  it('escapes separators, quotes and newlines', () => {
    expect(csvEscape('a,b', ',')).toBe('"a,b"');
    expect(csvEscape('say "hi"', ',')).toBe('"say ""hi"""');
    expect(csvEscape('a;b', ',')).toBe('a;b');
    expect(csvEscape('a\nb', ';')).toBe('"a\nb"');
  });

  it('has a BOM, header, one row per shift and totals', () => {
    const csv = buildCsv(report, ctx());
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toContain(
      'Date,Day,Start,End,Breaks,Worked,Hours (decimal),Day total,Note,Day note',
    );
    expect(csv).toContain(
      '10/12/2026,Mon,08:00,16:30,0:30,8:00,8,8:00,"Client ""A"", on-site; <b>",',
    );
    expect(csv).toContain('10/13/2026,Tue,22:00,02:00 (+1),0:00,4:00,4,4:00,,');
    expect(csv).toContain('Total,12:00,0:30,2');
  });

  it('German export uses ; and decimal commas', () => {
    const r = buildReport(
      [shift(at(2026, 10, 12, 8), at(2026, 10, 12, 15, 45))],
      { from: '2026-10-12', to: '2026-10-12' },
      settings,
      NOW,
    );
    const csv = buildCsv(r, ctx('de'));
    expect(csv).toContain('Datum;Tag;Beginn;Ende;Pausen;Arbeitszeit');
    expect(csv).toContain(';7,75;');
  });
});

describe('day notes', () => {
  const notes = {
    '2026-10-12': { text: 'Release v2, long meeting' },
    '2026-10-15': { text: 'Sick' },
  };
  const r = buildReport(data, { from: '2026-10-12', to: '2026-10-18' }, settings, NOW, notes);

  it('appear on the first row of their day; note-only days get their own row', () => {
    const csv = buildCsv(r, ctx());
    expect(csv).toContain('8:00,"Client ""A"", on-site; <b>","Release v2, long meeting"');
    expect(csv).toContain('10/15/2026,Thu,,,,,,,,Sick');
    // a note-only day does not change totals
    expect(csv).toContain('Total,12:00,0:30,2');
  });

  it('are included in JSON, text, HTML', () => {
    const json = JSON.parse(buildJson(r));
    expect(json.days.map((d: { date: string; note: string }) => [d.date, d.note])).toEqual([
      ['2026-10-12', 'Release v2, long meeting'],
      ['2026-10-13', ''],
      ['2026-10-15', 'Sick'],
    ]);
    expect(buildText(r, ctx())).toContain('Release v2, long meeting');
    expect(buildHtml(r, ctx('de'))).toContain('<th>Tagesnotiz</th>');
  });
});

describe('no pay data', () => {
  it('exports contain no earnings columns or fields', () => {
    const r = buildReport(data, { from: '2026-10-12', to: '2026-10-18' }, plainSettings(), NOW);
    const csv = buildCsv(r, ctx('de'));
    expect(csv).not.toMatch(/Verdienst|Steuern|€/);
    expect(csv).toMatch(/Gesamt;12:00;0:30;2/);
    expect(JSON.parse(buildJson(r)).total).not.toHaveProperty('earnings');
  });
});

describe('JSON', () => {
  it('is valid and contains ISO times and totals', () => {
    const json = JSON.parse(buildJson(report));
    expect(json.format).toBe('punch-clock-report');
    expect(json.days).toHaveLength(2);
    expect(json.days[0].shifts[0].start).toBe(new Date(at(2026, 10, 12, 8)).toISOString());
    expect(json.days[0].shifts[0].workedMinutes).toBe(480);
    expect(json.total.workedHours).toBe(12);
  });
});

describe('Text & HTML', () => {
  it('text contains entries and totals', () => {
    const txt = buildText(report, ctx());
    expect(txt).toContain('Timesheet');
    expect(txt).toContain('Mon 10/12/2026');
    expect(txt).toContain('12:00');
  });

  it('html escapes user content', () => {
    expect(escapeHtml('<b>"x"&</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;');
    const html = buildHtml(report, ctx());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Client &quot;A&quot;, on-site; &lt;b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('empty range shows the no-data message', () => {
    const empty = buildReport([], { from: '2026-01-01', to: '2026-01-07' }, settings, NOW);
    expect(buildText(empty, ctx())).toContain('No entries in this period.');
  });
});

describe('binary formats', () => {
  it('XLSX is a zip file', async () => {
    const f = await buildExport('xlsx', report, ctx());
    const bytes = f.data as Uint8Array;
    expect(f.filename).toBe('timesheet_2026-10-12_2026-10-18.xlsx');
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // "PK"
  });

  it('PDF starts with the PDF header', async () => {
    const f = await buildExport('pdf', report, ctx('de'));
    const head = new TextDecoder().decode((f.data as Uint8Array).slice(0, 5));
    expect(head).toBe('%PDF-');
    expect(f.mime).toBe('application/pdf');
  });
});
