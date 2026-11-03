import { makeStamp } from './rounding';
import type { Break, PunchStatus, RoundingRules, Shift, Stamp } from './types';

/**
 * Punch clock state machine. Pure functions: they take the current shift and
 * return a new one; the caller persists it.
 *
 *   off ──punchIn──▶ working ──startBreak──▶ break
 *    ▲                 │  ▲                    │
 *    └────punchOut─────┘  └─────endBreak───────┘
 *    ▲                                         │
 *    └──────────punchOut (ends break first)────┘
 */

export class PunchError extends Error {
  constructor(
    public readonly code: 'already-working' | 'not-working' | 'not-on-break' | 'on-break',
  ) {
    super(code);
    this.name = 'PunchError';
  }
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function openBreak(shift: Shift): Break | undefined {
  return shift.breaks.find((b) => b.end === null);
}

export function getStatus(active: Shift | undefined | null): PunchStatus {
  if (!active || active.end !== null) return 'off';
  return openBreak(active) ? 'break' : 'working';
}

export function punchIn(
  active: Shift | undefined | null,
  now: number,
  rules: RoundingRules,
  id: string = newId(),
): Shift {
  if (getStatus(active) !== 'off') throw new PunchError('already-working');
  return {
    id,
    start: makeStamp(now, rules.in),
    end: null,
    breaks: [],
    note: '',
    source: 'punch',
    createdAt: now,
    updatedAt: now,
  };
}

export function startBreak(
  shift: Shift | undefined | null,
  now: number,
  rules: RoundingRules,
  id: string = newId(),
): Shift {
  const status = getStatus(shift);
  if (status === 'off' || !shift) throw new PunchError('not-working');
  if (status === 'break') throw new PunchError('on-break');
  return normalizeShift({
    ...shift,
    breaks: [...shift.breaks, { id, start: makeStamp(now, rules.breakStart), end: null }],
    updatedAt: now,
  });
}

export function endBreak(
  shift: Shift | undefined | null,
  now: number,
  rules: RoundingRules,
): Shift {
  if (!shift || getStatus(shift) !== 'break') throw new PunchError('not-on-break');
  return normalizeShift({
    ...shift,
    breaks: shift.breaks.map((b) =>
      b.end === null ? { ...b, end: makeStamp(now, rules.breakEnd) } : b,
    ),
    updatedAt: now,
  });
}

/** Ends the shift. A running break is ended at the same moment first. */
export function punchOut(
  shift: Shift | undefined | null,
  now: number,
  rules: RoundingRules,
): Shift {
  if (!shift || getStatus(shift) === 'off') throw new PunchError('not-working');
  const withBreakEnded = getStatus(shift) === 'break' ? endBreak(shift, now, rules) : shift;
  return normalizeShift({
    ...withBreakEnded,
    end: makeStamp(now, rules.out),
    updatedAt: now,
  });
}

/**
 * A shift still running after the day it started (someone forgot to punch out)
 * is ended at 23:59 of that day and marked, so the office knows to ask.
 * Returns null when nothing needs closing.
 */
export function autoCloseStale(
  shift: Shift | undefined | null,
  now: number,
  rules: RoundingRules,
): Shift | null {
  if (!shift || getStatus(shift) === 'off') return null;
  const s = new Date(shift.start.raw);
  const endOfDay = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 23, 59).getTime();
  if (now <= endOfDay + 60_000) return null;
  return { ...punchOut(shift, Math.max(endOfDay, shift.start.raw), rules), autoClosed: true };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Enforce ordering invariants that rounding can break, e.g. punch in 7:50 →
 * rounded up to 8:00, punch out 7:55 → rounded down to 7:45. Rounded values are
 * clamped so that start ≤ break start ≤ break end ≤ end. Raw values are kept
 * as recorded (they are the audit trail) but kept in the same order.
 */
export function normalizeShift(shift: Shift): Shift {
  const start = shift.start;
  let end = shift.end;
  if (end) {
    end = {
      raw: Math.max(end.raw, start.raw),
      rounded: Math.max(end.rounded, start.rounded),
    };
  }
  const hiRounded = end ? end.rounded : Infinity;
  const hiRaw = end ? end.raw : Infinity;

  const breaks = [...shift.breaks]
    .sort((a, b) => a.start.raw - b.start.raw)
    .map((b) => {
      const bStart: Stamp = {
        raw: clamp(b.start.raw, start.raw, hiRaw),
        rounded: clamp(b.start.rounded, start.rounded, hiRounded),
      };
      // A finished shift cannot contain a running break: close it at the shift end.
      const rawEnd = b.end ?? end;
      const bEnd: Stamp | null = rawEnd
        ? {
            raw: clamp(rawEnd.raw, bStart.raw, hiRaw),
            rounded: clamp(rawEnd.rounded, bStart.rounded, hiRounded),
          }
        : null;
      return { ...b, start: bStart, end: bEnd };
    });

  return { ...shift, end, breaks };
}
