import type { RoundingRule, RoundingRules, Stamp } from './types';

const MINUTE = 60_000;
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 1440;

/**
 * The company app records exact times only; rounding is decided in the office.
 * The rounding engine stays so stamps keep their raw/rounded shape.
 */
export const NO_ROUNDING: RoundingRules = {
  in: { mode: 'off', interval: 1 },
  out: { mode: 'off', interval: 1 },
  breakStart: { mode: 'off', interval: 1 },
  breakEnd: { mode: 'off', interval: 1 },
};

const tzOffsetMs = (ms: number) => new Date(ms).getTimezoneOffset() * MINUTE;

/**
 * Round an instant to the rule's grid in *local wall-clock time*.
 *
 * The grid is anchored at local midnight, so a 15 minute rule always lands on
 * :00/:15/:30/:45 regardless of time zone. Results that spill past midnight roll
 * into the next day (23:53 → 00:00 next day).
 *
 * DST: wall-clock arithmetic is done with Date's local constructors, which skip
 * non-existent times forward. In the repeated hour (fall back) the constructor
 * would pick the first occurrence, so the result is corrected by the offset
 * difference when that would move the time the wrong way.
 */
export function roundTime(ms: number, rule: RoundingRule): number {
  if (rule.mode === 'off') return ms;
  const interval = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(rule.interval)));
  const intervalMs = interval * MINUTE;

  const d = new Date(ms);
  const wallMs =
    ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();

  const q = wallMs / intervalMs;
  const steps =
    rule.mode === 'nearest'
      ? Math.floor(q + 0.5)
      : rule.mode === 'up'
        ? Math.ceil(q)
        : Math.floor(q);

  let result = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, steps * interval).getTime();

  const wrongDirection =
    (rule.mode === 'up' && result < ms) || (rule.mode === 'down' && result > ms);
  if (wrongDirection || Math.abs(result - ms) > intervalMs) {
    const corrected = result + (tzOffsetMs(ms) - tzOffsetMs(result));
    if (Math.abs(corrected - ms) < Math.abs(result - ms)) result = corrected;
  }
  return result;
}

export function makeStamp(raw: number, rule: RoundingRule): Stamp {
  return { raw, rounded: roundTime(raw, rule) };
}

/** A stamp whose rounded value equals the raw value (manual edits). */
export function exactStamp(ms: number): Stamp {
  return { raw: ms, rounded: ms };
}

export function stampTime(stamp: Stamp, useRaw: boolean): number {
  return useRaw ? stamp.raw : stamp.rounded;
}
