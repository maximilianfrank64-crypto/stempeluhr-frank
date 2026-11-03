import { describe, expect, it } from 'vitest';
import { at, plainSettings, shift } from '../test/helpers';
import { backupDue, createBackup, mergeDayNotes, mergeShifts, parseBackup } from './backup';

const DAY = 86_400_000;
const NOW = at(2026, 10, 14, 12);

describe('backup round trip', () => {
  it('parses what it creates', () => {
    const shifts = [
      shift(at(2026, 10, 12, 8), at(2026, 10, 12, 16)),
      shift(at(2026, 10, 13, 8), null),
    ];
    const settings = plainSettings({ language: 'de' });
    const text = JSON.stringify(createBackup(shifts, settings, NOW));
    const res = parseBackup(text, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.backup.shifts).toEqual(shifts);
    expect(res.backup.settings).toEqual(settings);
    expect(res.skipped).toBe(0);
  });

  it('round-trips day notes and accepts older backups without them', () => {
    const notes = [{ date: '2026-10-12', text: 'Kickoff', updatedAt: 5 }];
    const res = parseBackup(JSON.stringify(createBackup([], plainSettings(), NOW, notes)), NOW);
    expect(res.ok && res.backup.dayNotes).toEqual(notes);

    const old = parseBackup('{"app":"punch-clock","version":1,"shifts":[]}', NOW);
    expect(old.ok && old.backup.dayNotes).toEqual([]);

    const bad = parseBackup(
      JSON.stringify({
        app: 'punch-clock',
        shifts: [],
        dayNotes: [{ date: '2026-02-30', text: 'x' }, { date: '2026-10-01', text: '  ' }, 'nope'],
      }),
      NOW,
    );
    expect(bad.ok && bad.backup.dayNotes).toEqual([]);
  });

  it('rejects non-backups and future versions', () => {
    expect(parseBackup('nope', NOW)).toEqual({ ok: false, error: 'invalid-json' });
    expect(parseBackup('{"foo":1}', NOW)).toEqual({ ok: false, error: 'not-a-backup' });
    expect(parseBackup('{"app":"punch-clock","version":99,"shifts":[]}', NOW)).toEqual({
      ok: false,
      error: 'newer-version',
    });
  });

  it('skips invalid shifts and extra running shifts, fills defaults', () => {
    const text = JSON.stringify({
      app: 'punch-clock',
      version: 1,
      settings: { timeFormat: 'bogus' },
      shifts: [
        { id: 'ok', start: at(2026, 10, 1, 8), end: at(2026, 10, 1, 9) }, // plain numbers accepted
        { id: 'bad', start: 'yesterday' },
        { start: at(2026, 10, 2, 8) }, // missing id
        { id: 'r1', start: { raw: at(2026, 10, 3, 8) }, end: null },
        { id: 'r2', start: { raw: at(2026, 10, 4, 8) }, end: null },
      ],
    });
    const res = parseBackup(text, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.backup.shifts.map((s) => s.id)).toEqual(['ok', 'r2']);
    expect(res.skipped).toBe(3);
    expect(res.backup.settings.timeFormat).toBe('12h');
  });
});

describe('mergeShifts', () => {
  it('newer updatedAt wins, new ids are added', () => {
    const a = shift(at(2026, 10, 1, 8), at(2026, 10, 1, 9), [], {
      id: 'x',
      updatedAt: 1,
      note: 'old',
    });
    const b = { ...a, note: 'new', updatedAt: 2 };
    const c = shift(at(2026, 10, 2, 8), at(2026, 10, 2, 9), [], { id: 'y' });
    const merged = mergeShifts([a], [b, c]);
    expect(merged.find((s) => s.id === 'x')!.note).toBe('new');
    expect(merged).toHaveLength(2);
    expect(mergeShifts([b], [a]).find((s) => s.id === 'x')!.note).toBe('new');
  });

  it('keeps only one running shift', () => {
    const r1 = shift(at(2026, 10, 1, 8), null, [], { id: 'r1' });
    const r2 = shift(at(2026, 10, 2, 8), null, [], { id: 'r2' });
    expect(mergeShifts([r1], [r2]).map((s) => s.id)).toEqual(['r2']);
  });
});

describe('mergeDayNotes', () => {
  it('newer note per date wins', () => {
    const a = { date: '2026-10-12', text: 'old', updatedAt: 1 };
    const b = { date: '2026-10-12', text: 'new', updatedAt: 2 };
    const c = { date: '2026-10-13', text: 'other', updatedAt: 1 };
    expect(mergeDayNotes([a], [b, c])).toEqual([b, c]);
    expect(mergeDayNotes([b], [a])).toEqual([b]);
  });
});

describe('backupDue', () => {
  const base = {
    now: NOW,
    intervalDays: 30,
    hasData: true,
    lastBackupAt: null,
    dismissedAt: null,
    firstDataAt: NOW - 40 * DAY,
  };
  it('reminds after the interval since first data / last backup / dismissal', () => {
    expect(backupDue(base)).toBe(true);
    expect(backupDue({ ...base, firstDataAt: NOW - 10 * DAY })).toBe(false);
    expect(backupDue({ ...base, lastBackupAt: NOW - 5 * DAY })).toBe(false);
    expect(backupDue({ ...base, dismissedAt: NOW - 1 * DAY })).toBe(false);
    expect(backupDue({ ...base, hasData: false })).toBe(false);
    expect(backupDue({ ...base, intervalDays: 0 })).toBe(false);
  });
});
