import { describe, expect, it } from 'vitest';
import { at, shift } from '../test/helpers';
import { formFromShift, isNextDay, shiftFromForm } from './edit';
import { NO_ROUNDING } from './rounding';

const plain = NO_ROUNDING;
const quarterHours = {
  in: { mode: 'nearest', interval: 15 },
  out: { mode: 'nearest', interval: 15 },
  breakStart: { mode: 'off', interval: 5 },
  breakEnd: { mode: 'off', interval: 5 },
} as const;
const base = { rules: plain, applyRounding: false, now: at(2026, 10, 14, 20), allowOpen: false };

describe('shiftFromForm', () => {
  it('creates a manual shift with exact times', () => {
    const res = shiftFromForm(
      {
        date: '2026-10-14',
        start: '08:00',
        end: '16:30',
        breaks: [{ id: 'b', start: '12:00', end: '12:30' }],
        note: ' x ',
      },
      base,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.shift.start).toEqual({ raw: at(2026, 10, 14, 8), rounded: at(2026, 10, 14, 8) });
    expect(res.shift.end!.rounded).toBe(at(2026, 10, 14, 16, 30));
    expect(res.shift.breaks[0]!.end!.rounded).toBe(at(2026, 10, 14, 12, 30));
    expect(res.shift.source).toBe('manual');
    expect(res.shift.note).toBe('x');
  });

  it('treats an end before the start as the next day', () => {
    const res = shiftFromForm(
      {
        date: '2026-10-14',
        start: '22:00',
        end: '06:00',
        breaks: [{ id: 'b', start: '02:00', end: '02:30' }],
        note: '',
      },
      base,
    );
    expect(res.ok && res.shift.end!.rounded).toBe(at(2026, 10, 15, 6));
    expect(res.ok && res.shift.breaks[0]!.start.rounded).toBe(at(2026, 10, 15, 2));
    expect(
      isNextDay(
        { date: '2026-10-14', start: '22:00', end: '06:00', breaks: [], note: '' },
        '06:00',
      ),
    ).toBe(true);
  });

  it('end equal to start stays on the same day (zero-length, not 24h)', () => {
    const f = { date: '2026-10-14', start: '13:30', end: '13:30', breaks: [], note: '' };
    const res = shiftFromForm(f, base);
    expect(res.ok && res.shift.end!.rounded).toBe(at(2026, 10, 14, 13, 30));
    expect(isNextDay(f, '13:30')).toBe(false);
  });

  it('applies rounding rules when asked', () => {
    const res = shiftFromForm(
      { date: '2026-10-14', start: '07:47', end: '15:55', breaks: [], note: '' },
      { ...base, rules: quarterHours, applyRounding: true },
    );
    expect(res.ok && res.shift.start).toEqual({
      raw: at(2026, 10, 14, 7, 47),
      rounded: at(2026, 10, 14, 7, 45),
    });
    expect(res.ok && res.shift.end!.rounded).toBe(at(2026, 10, 14, 16));
  });

  it('keeps the original raw stamp for unchanged fields', () => {
    const s = shift(at(2026, 10, 14, 7, 45), at(2026, 10, 14, 16));
    s.start = { raw: at(2026, 10, 14, 7, 47, 12), rounded: at(2026, 10, 14, 7, 45) };
    const form = { ...formFromShift(s), end: '17:00' };
    const res = shiftFromForm(form, { ...base, existing: s });
    expect(res.ok && res.shift.start).toEqual(s.start);
    expect(res.ok && res.shift.end).toEqual({
      raw: at(2026, 10, 14, 17),
      rounded: at(2026, 10, 14, 17),
    });
    expect(res.ok && res.shift.id).toBe(s.id);
  });

  it('validates', () => {
    const f = { date: '2026-10-14', start: '08:00', end: '16:00', breaks: [], note: '' };
    expect(shiftFromForm({ ...f, end: '' }, base)).toEqual({ ok: false, error: 'endRequired' });
    expect(shiftFromForm({ ...f, start: '25:00' }, base)).toEqual({ ok: false, error: 'invalid' });
    expect(shiftFromForm({ ...f, date: '2026-02-30' }, base)).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(
      shiftFromForm({ ...f, breaks: [{ id: 'b', start: '17:00', end: '17:30' }] }, base),
    ).toEqual({ ok: false, error: 'breakOutside' });
    // a running shift may stay open
    expect(shiftFromForm({ ...f, end: '' }, { ...base, allowOpen: true }).ok).toBe(true);
  });
});
