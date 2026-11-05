import { calcShift } from './calc';
import { hoursDecimal } from './format';
import { dayKey } from './periods';
import type { CompanySettings, DayNote, GeoResult, Rapport, Settings, Shift } from './types';

/**
 * What the app sends to the company (n8n webhook). Each message carries the
 * latest full state of one record, so the receiver simply upserts by `key`
 * and a lost or repeated message never corrupts anything.
 */
export type SyncItem =
  | {
      kind: 'shift';
      id: string;
      /** Local day the shift counts towards, yyyy-MM-dd. */
      date: string;
      /** Exact clock times, ISO-8601 UTC (no rounding; the office decides). */
      start: string;
      end: string | null;
      breakMinutes: number;
      workedMinutes: number;
      workedHours: number;
      source: Shift['source'];
      /** Ended automatically at 23:59 because nobody punched out. */
      autoClosed: boolean;
      note: string;
      startLocation: GeoResult | null;
      endLocation: GeoResult | null;
    }
  | { kind: 'shiftDeleted'; id: string }
  | {
      kind: 'dayNote';
      date: string;
      text: string;
      /** Job site address as typed; '' when none. The workflow checks it against the GPS. */
      address: string;
      rapport: Rapport | null;
    };

export interface SyncMessage {
  v: 1;
  employee: string;
  deviceId: string;
  sentAt: string;
  item: SyncItem;
}

/** Sending is on only when the app has a server address and the employee set name and key. */
export function syncConfigured(company: CompanySettings, url: string): boolean {
  return url !== '' && company.employeeName !== '' && company.accessKey !== '';
}

/** Records with the same key replace each other in the outbox: only the newest state is sent. */
export function itemKey(item: SyncItem): string {
  return item.kind === 'dayNote' ? `note:${item.date}` : `shift:${item.id}`;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function shiftItem(shift: Shift, settings: Settings, now: number): SyncItem {
  const c = calcShift(shift, { useRaw: true, now, autoBreak: settings.autoBreak });
  return {
    kind: 'shift',
    id: shift.id,
    date: dayKey(shift.start.raw),
    start: iso(shift.start.raw),
    end: shift.end ? iso(shift.end.raw) : null,
    breakMinutes: Math.round(c.breakMs / 60_000),
    workedMinutes: Math.round(c.netMs / 60_000),
    workedHours: hoursDecimal(c.netMs),
    source: shift.source,
    autoClosed: shift.autoClosed === true,
    note: shift.note,
    startLocation: shift.startLocation ?? null,
    endLocation: shift.endLocation ?? null,
  };
}

export function dayNoteItem(date: string, note: DayNote | undefined): SyncItem {
  return {
    kind: 'dayNote',
    date,
    text: note?.text ?? '',
    address: note?.address ?? '',
    rapport: note?.rapport ?? null,
  };
}

export function syncMessage(
  item: SyncItem,
  company: CompanySettings,
  deviceId: string,
  now: number,
): SyncMessage {
  return { v: 1, employee: company.employeeName, deviceId, sentAt: iso(now), item };
}

/**
 * Records to send when someone switches sending on: the current and the
 * previous month, so a week or month that started before setup is complete.
 */
export function backlogItems(
  shifts: Shift[],
  dayNotes: Readonly<Record<string, DayNote>>,
  settings: Settings,
  now: number,
): SyncItem[] {
  const d = new Date(now);
  const from = dayKey(new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime());
  const items: SyncItem[] = shifts
    .filter((s) => dayKey(s.start.raw) >= from)
    .map((s) => shiftItem(s, settings, now));
  for (const [date, n] of Object.entries(dayNotes)) {
    if (date >= from) items.push(dayNoteItem(date, n));
  }
  return items;
}

/** A Rapport answer is complete when it is "no", or "yes" with hours and a description. */
export function rapportComplete(r: Rapport | undefined): r is Rapport {
  return r !== undefined && (!r.done || (r.hours > 0 && r.text.trim() !== ''));
}

/** Punching out still needs answers for this day: job site and work, and Rapport. */
export function needsPunchOutAnswers(note: DayNote | undefined): boolean {
  return !note || note.text.trim() === '' || !rapportComplete(note.rapport);
}
