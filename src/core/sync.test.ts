import { describe, expect, it } from 'vitest';
import { at, plainSettings, shift } from '../test/helpers';
import {
  backlogItems,
  dayNoteItem,
  itemKey,
  rapportComplete,
  shiftItem,
  syncConfigured,
  syncMessage,
} from './sync';

const company = { employeeName: 'Jonas Weber', accessKey: 'k' };
const note = (date: string, text: string) => ({ date, text, updatedAt: 0 });

describe('sync', () => {
  it('is configured only with server address, name and key', () => {
    expect(syncConfigured(company, 'https://n8n.example/webhook/x')).toBe(true);
    expect(syncConfigured(company, '')).toBe(false);
    expect(syncConfigured({ ...company, employeeName: '' }, 'https://x')).toBe(false);
    expect(syncConfigured({ ...company, accessKey: '' }, 'https://x')).toBe(false);
  });

  it('a shift carries exact times, hours, the day and both locations', () => {
    const loc = { lat: 48.7758, lon: 9.1829, accuracyM: 12, at: at(2026, 10, 12, 7, 2) };
    const s = shift(at(2026, 10, 12, 7), at(2026, 10, 12, 16), [
      [at(2026, 10, 12, 12), at(2026, 10, 12, 12, 30)],
    ]);
    s.start = { raw: at(2026, 10, 12, 6, 53), rounded: at(2026, 10, 12, 7) };
    s.startLocation = loc;
    s.endLocation = { error: 'denied' };
    const item = shiftItem(s, plainSettings(), at(2026, 10, 12, 20));
    expect(item).toMatchObject({
      kind: 'shift',
      date: '2026-10-12',
      start: new Date(at(2026, 10, 12, 6, 53)).toISOString(),
      breakMinutes: 30,
      workedMinutes: 8.5 * 60 + 7,
      autoClosed: false,
      startLocation: loc,
      endLocation: { error: 'denied' },
    });
    expect(item).not.toHaveProperty('startRounded');
  });

  it('Rapport: "no" is complete, "yes" needs hours and a description', () => {
    expect(rapportComplete(undefined)).toBe(false);
    expect(rapportComplete({ done: false })).toBe(true);
    expect(rapportComplete({ done: true, hours: 0, text: 'x' })).toBe(false);
    expect(rapportComplete({ done: true, hours: 1.5, text: ' ' })).toBe(false);
    expect(rapportComplete({ done: true, hours: 1.5, text: 'Treppenhaus' })).toBe(true);
    expect(
      dayNoteItem('2026-10-12', {
        ...note('2026-10-12', 'Müller'),
        address: 'Hauptstr. 5, Esslingen',
        rapport: { done: true, hours: 2, text: 'Treppenhaus' },
      }),
    ).toEqual({
      kind: 'dayNote',
      date: '2026-10-12',
      text: 'Müller',
      address: 'Hauptstr. 5, Esslingen',
      rapport: { done: true, hours: 2, text: 'Treppenhaus' },
    });
    expect(dayNoteItem('2026-10-12', undefined)).toMatchObject({ text: '', rapport: null });
  });

  it('no location recorded is sent as null, never as a guess', () => {
    const item = shiftItem(shift(at(2026, 10, 12, 7), null), plainSettings(), at(2026, 10, 12, 8));
    expect(item).toMatchObject({ end: null, startLocation: null, endLocation: null });
  });

  it('records of the same shift or day share one outbox key', () => {
    expect(itemKey({ kind: 'shiftDeleted', id: 'a' })).toBe('shift:a');
    expect(itemKey(shiftItem(shift(0, 1, [], { id: 'a' }), plainSettings(), 1))).toBe('shift:a');
    expect(itemKey(dayNoteItem('2026-10-12', undefined))).toBe('note:2026-10-12');
  });

  it('messages name the employee and the device', () => {
    const m = syncMessage({ kind: 'shiftDeleted', id: 'a' }, company, 'dev-1', 0);
    expect(m).toEqual({
      v: 1,
      employee: 'Jonas Weber',
      deviceId: 'dev-1',
      sentAt: '1970-01-01T00:00:00.000Z',
      item: { kind: 'shiftDeleted', id: 'a' },
    });
  });

  it('backlog covers this and last month only', () => {
    const shifts = [
      shift(at(2026, 8, 31, 8), at(2026, 8, 31, 12)),
      shift(at(2026, 9, 1, 8), at(2026, 9, 1, 12)),
      shift(at(2026, 10, 14, 8), at(2026, 10, 14, 12)),
    ];
    const notes = {
      '2026-08-31': note('2026-08-31', 'alt'),
      '2026-10-14': note('2026-10-14', 'Müller, Esslingen'),
    };
    const items = backlogItems(shifts, notes, plainSettings(), at(2026, 10, 16, 12));
    expect(
      items.map((i) => (i.kind === 'dayNote' ? i.date : i.kind === 'shift' && i.date)),
    ).toEqual(['2026-09-01', '2026-10-14', '2026-10-14']);
  });
});
