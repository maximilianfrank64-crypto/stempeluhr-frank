import { normalizeShift } from './punch';
import { sanitizeSettings } from './settings';
import { dayKey, isValidDayKey } from './periods';
import type { Break, DayNote, GeoResult, Rapport, Settings, Shift, Stamp } from './types';

export const BACKUP_APP_ID = 'punch-clock';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  version: number;
  exportedAt: string;
  settings: Settings;
  shifts: Shift[];
  /** Added later; older backups don't have it (treated as empty). */
  dayNotes: DayNote[];
}

export function createBackup(
  shifts: Shift[],
  settings: Settings,
  now: number,
  dayNotes: DayNote[] = [],
): BackupFile {
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    settings,
    shifts,
    dayNotes,
  };
}

function parseDayNotes(v: unknown, now: number): DayNote[] {
  if (!Array.isArray(v)) return [];
  const out = new Map<string, DayNote>();
  for (const n of v) {
    if (!isObj(n) || typeof n.date !== 'string' || !isValidDayKey(n.date)) continue;
    const text = typeof n.text === 'string' ? n.text : '';
    const rapport = parseRapport(n.rapport);
    if (text.trim() === '' && !rapport) continue;
    out.set(n.date, {
      date: n.date,
      text,
      ...(rapport && { rapport }),
      updatedAt: isTime(n.updatedAt) ? n.updatedAt : now,
    });
  }
  return [...out.values()];
}

export type ParseResult =
  | { ok: true; backup: BackupFile; skipped: number }
  | { ok: false; error: 'invalid-json' | 'not-a-backup' | 'newer-version' };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseStamp(v: unknown): Stamp | null {
  if (isTime(v)) return { raw: v, rounded: v };
  if (!isObj(v) || !isTime(v.raw)) return null;
  return { raw: v.raw, rounded: isTime(v.rounded) ? v.rounded : v.raw };
}

function parseShift(v: unknown, now: number): Shift | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const start = parseStamp(v.start);
  if (!start) return null;
  const end = v.end === null || v.end === undefined ? null : parseStamp(v.end);
  if (v.end != null && !end) return null;
  const breaks: Break[] = [];
  if (Array.isArray(v.breaks)) {
    for (const b of v.breaks) {
      if (!isObj(b)) continue;
      const bs = parseStamp(b.start);
      if (!bs) continue;
      const be = b.end == null ? null : parseStamp(b.end);
      breaks.push({
        id: typeof b.id === 'string' ? b.id : `${v.id}-b${breaks.length}`,
        start: bs,
        end: be,
      });
    }
  }
  return normalizeShift({
    id: v.id,
    start,
    end,
    breaks,
    note: typeof v.note === 'string' ? v.note : '',
    source: v.source === 'manual' ? 'manual' : 'punch',
    createdAt: isTime(v.createdAt) ? v.createdAt : now,
    updatedAt: isTime(v.updatedAt) ? v.updatedAt : now,
    startLocation: parseGeo(v.startLocation),
    endLocation: parseGeo(v.endLocation),
    ...(v.autoClosed === true && { autoClosed: true }),
  });
}

function parseRapport(v: unknown): Rapport | undefined {
  if (!isObj(v)) return undefined;
  if (v.done === false) return { done: false };
  if (v.done === true && isTime(v.hours) && typeof v.text === 'string') {
    return { done: true, hours: v.hours, text: v.text };
  }
  return undefined;
}

const GEO_ERRORS = ['denied', 'unavailable', 'timeout', 'unsupported'] as const;

function parseGeo(v: unknown): GeoResult | undefined {
  if (!isObj(v)) return undefined;
  if (isTime(v.lat) && isTime(v.lon)) {
    return {
      lat: v.lat,
      lon: v.lon,
      accuracyM: isTime(v.accuracyM) ? v.accuracyM : 0,
      at: isTime(v.at) ? v.at : 0,
    };
  }
  const error = GEO_ERRORS.find((e) => e === v.error);
  return error ? { error } : undefined;
}

/** Validate an untrusted backup file. Invalid shifts are skipped and counted. */
export function parseBackup(text: string, now: number): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  if (!isObj(data) || data.app !== BACKUP_APP_ID || !Array.isArray(data.shifts)) {
    return { ok: false, error: 'not-a-backup' };
  }
  if (typeof data.version === 'number' && data.version > BACKUP_VERSION) {
    return { ok: false, error: 'newer-version' };
  }
  const shifts: Shift[] = [];
  let skipped = 0;
  for (const s of data.shifts) {
    const parsed = parseShift(s, now);
    if (parsed) shifts.push(parsed);
    else skipped++;
  }
  // Only one shift may be running.
  const running = shifts.filter((s) => s.end === null).sort((a, b) => b.start.raw - a.start.raw);
  for (const extra of running.slice(1)) {
    const i = shifts.indexOf(extra);
    shifts.splice(i, 1);
    skipped++;
  }
  return {
    ok: true,
    skipped,
    backup: {
      app: BACKUP_APP_ID,
      version: BACKUP_VERSION,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
      settings: sanitizeSettings(data.settings),
      shifts,
      dayNotes: parseDayNotes(data.dayNotes, now),
    },
  };
}

/**
 * Merge imported shifts into existing ones: same id → the more recently
 * updated version wins. If that leaves two running shifts, the newer one is kept running.
 */
export function mergeShifts(existing: Shift[], incoming: Shift[]): Shift[] {
  const byId = new Map(existing.map((s) => [s.id, s]));
  for (const s of incoming) {
    const cur = byId.get(s.id);
    if (!cur || s.updatedAt >= cur.updatedAt) byId.set(s.id, s);
  }
  const all = [...byId.values()];
  const running = all.filter((s) => s.end === null).sort((a, b) => b.start.raw - a.start.raw);
  return all.filter((s) => s.end !== null || s === running[0]);
}

const DAY = 86_400_000;

/** How long entries stay on the phone, so employees can always look back. */
export const KEEP_YEARS = 2;

/** First day (yyyy-MM-dd) that is kept; anything before it is deleted from the phone. */
export function retentionStart(now: number): string {
  const d = new Date(now);
  return dayKey(new Date(d.getFullYear() - KEEP_YEARS, d.getMonth(), d.getDate()).getTime());
}

/**
 * Whether to show the "please back up" reminder: only when there is data,
 * the reminder is enabled, and neither a backup nor a dismissal happened
 * within the last `intervalDays`.
 */
export function backupDue(opts: {
  now: number;
  intervalDays: number;
  hasData: boolean;
  lastBackupAt: number | null;
  dismissedAt: number | null;
  firstDataAt: number | null;
}): boolean {
  if (!opts.hasData || opts.intervalDays <= 0) return false;
  const interval = opts.intervalDays * DAY;
  const last = Math.max(opts.lastBackupAt ?? 0, opts.dismissedAt ?? 0, opts.firstDataAt ?? 0);
  return opts.now - last >= interval;
}

/** Merge day notes: per date, the more recently updated note wins. */
export function mergeDayNotes(existing: DayNote[], incoming: DayNote[]): DayNote[] {
  const byDate = new Map(existing.map((n) => [n.date, n]));
  for (const n of incoming) {
    const cur = byDate.get(n.date);
    if (!cur || n.updatedAt >= cur.updatedAt) byDate.set(n.date, n);
  }
  return [...byDate.values()];
}
