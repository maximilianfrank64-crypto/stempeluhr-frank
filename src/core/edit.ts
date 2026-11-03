import { addDays, format } from 'date-fns';
import { dayKey, dayStart, isValidDayKey } from './periods';
import { newId, normalizeShift } from './punch';
import { exactStamp, makeStamp } from './rounding';
import type { Break, RoundingRules, Shift, Stamp } from './types';

/** Editable form values. Times are local wall-clock "HH:mm". */
export interface ShiftForm {
  date: string;
  start: string;
  /** Empty only for the currently running shift. */
  end: string;
  breaks: { id: string; start: string; end: string }[];
  note: string;
}

export type EditError = 'invalid' | 'endRequired' | 'tooLong' | 'breakOutside';

const DAY_MS = 86_400_000;
const hhmm = (ms: number) => format(ms, 'HH:mm');

export function formFromShift(shift: Shift): ShiftForm {
  return {
    date: dayKey(shift.start.rounded),
    start: hhmm(shift.start.rounded),
    end: shift.end ? hhmm(shift.end.rounded) : '',
    breaks: shift.breaks.map((b) => ({
      id: b.id,
      start: hhmm(b.start.rounded),
      end: b.end ? hhmm(b.end.rounded) : '',
    })),
    note: shift.note,
  };
}

export function emptyForm(date: string): ShiftForm {
  return { date, start: '09:00', end: '17:00', breaks: [], note: '' };
}

function parseTime(v: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? { h, m: min } : null;
}

/**
 * Wall-clock time on `date`, or on the next day if it lies before `notBefore`
 * (an overnight shift: 22:00 – 06:00 ends on the next day).
 */
export function resolveTime(date: string, time: string, notBefore?: number): number | null {
  const t = parseTime(time);
  if (!t || !isValidDayKey(date)) return null;
  const base = new Date(dayStart(date));
  let ms = new Date(base.getFullYear(), base.getMonth(), base.getDate(), t.h, t.m).getTime();
  if (notBefore !== undefined && ms < notBefore) {
    const next = addDays(base, 1);
    ms = new Date(next.getFullYear(), next.getMonth(), next.getDate(), t.h, t.m).getTime();
  }
  return ms;
}

/** Keep the original stamp (with its raw time) if the user didn't change the displayed time. */
function stampFor(
  ms: number,
  original: Stamp | null | undefined,
  rule: RoundingRules[keyof RoundingRules],
  applyRounding: boolean,
): Stamp {
  // The form shows whole minutes, so compare at minute precision.
  if (original && Math.floor(original.rounded / 60_000) === Math.floor(ms / 60_000))
    return original;
  return applyRounding ? makeStamp(ms, rule) : exactStamp(ms);
}

export function shiftFromForm(
  form: ShiftForm,
  opts: {
    existing?: Shift;
    rules: RoundingRules;
    applyRounding: boolean;
    now: number;
    /** The running shift may have no end. */
    allowOpen: boolean;
  },
): { ok: true; shift: Shift } | { ok: false; error: EditError } {
  const { existing, rules, applyRounding } = opts;
  const start = resolveTime(form.date, form.start);
  if (start === null) return { ok: false, error: 'invalid' };

  let end: number | null = null;
  if (form.end.trim() === '') {
    if (!opts.allowOpen) return { ok: false, error: 'endRequired' };
  } else {
    end = resolveTime(form.date, form.end, start);
    if (end === null) return { ok: false, error: 'invalid' };
    if (end - start > DAY_MS) return { ok: false, error: 'tooLong' };
  }

  const breaks: Break[] = [];
  for (const b of form.breaks) {
    if (b.start.trim() === '' && b.end.trim() === '') continue;
    const bs = resolveTime(form.date, b.start, start);
    if (bs === null) return { ok: false, error: 'invalid' };
    const isOpen = b.end.trim() === '';
    if (isOpen && end !== null) return { ok: false, error: 'invalid' };
    const be = isOpen ? null : resolveTime(form.date, b.end, bs);
    if (!isOpen && be === null) return { ok: false, error: 'invalid' };
    if (bs < start || (end !== null && (be ?? bs) > end) || (end !== null && bs > end)) {
      return { ok: false, error: 'breakOutside' };
    }
    const orig = existing?.breaks.find((x) => x.id === b.id);
    breaks.push({
      id: b.id || newId(),
      start: stampFor(bs, orig?.start, rules.breakStart, applyRounding),
      end: be === null ? null : stampFor(be, orig?.end, rules.breakEnd, applyRounding),
    });
  }
  if (breaks.filter((b) => b.end === null).length > 1) return { ok: false, error: 'invalid' };

  const shift: Shift = normalizeShift({
    id: existing?.id ?? newId(),
    start: stampFor(start, existing?.start, rules.in, applyRounding),
    end: end === null ? null : stampFor(end, existing?.end, rules.out, applyRounding),
    breaks,
    note: form.note.trim(),
    source: existing?.source ?? 'manual',
    createdAt: existing?.createdAt ?? opts.now,
    updatedAt: opts.now,
  });
  return { ok: true, shift };
}

/** For the editor UI: does this time fall on the next day relative to the start? */
export function isNextDay(form: ShiftForm, time: string): boolean {
  const start = resolveTime(form.date, form.start);
  if (start === null || time.trim() === '') return false;
  const t = resolveTime(form.date, time, start);
  return t !== null && dayKey(t) !== form.date;
}
