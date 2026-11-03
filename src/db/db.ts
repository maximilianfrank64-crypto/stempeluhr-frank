import Dexie, { type Table } from 'dexie';
import type { SyncItem } from '../core/sync';
import type { DayNote, Settings, Shift } from '../core/types';

export interface KV {
  key: string;
  value: unknown;
}

export interface Meta {
  lastBackupAt: number | null;
  backupReminderDismissedAt: number | null;
  /** Random id of this installation, sent with every message to the company. */
  deviceId: string | null;
  lastSyncAt: number | null;
}

/** A record waiting to be sent; `key` identifies the record (newer replaces older). */
export interface OutboxEntry {
  key: string;
  item: SyncItem;
  queuedAt: number;
}

/**
 * IndexedDB schema.
 *  - shifts: one row per shift; the active session is the row with end === null.
 *  - kv: settings and small app metadata.
 *  - dayNotes: optional note per calendar day (added in v2).
 *  - outbox: records not yet delivered to the company (added in v3).
 * Bump the version and add an upgrade() when changing indexes.
 */
class PunchDB extends Dexie {
  shifts!: Table<Shift, string>;
  kv!: Table<KV, string>;
  dayNotes!: Table<DayNote, string>;
  outbox!: Table<OutboxEntry, string>;

  constructor(name = 'punch-clock') {
    super(name);
    this.version(1).stores({
      shifts: 'id, start.raw, updatedAt',
      kv: 'key',
    });
    // v2: day notes. Existing tables are kept as they are.
    this.version(2).stores({ dayNotes: 'date' });
    // v3: outbox for sending to the company.
    this.version(3).stores({ outbox: 'key, queuedAt' });
  }
}

export const db = new PunchDB();

const SETTINGS_KEY = 'settings';
const META_KEY = 'meta';

export const defaultMeta = (): Meta => ({
  lastBackupAt: null,
  backupReminderDismissedAt: null,
  deviceId: null,
  lastSyncAt: null,
});

export async function loadAll(): Promise<{
  shifts: Shift[];
  settings: unknown;
  meta: Meta;
  dayNotes: DayNote[];
}> {
  return db.transaction('r', db.shifts, db.kv, db.dayNotes, async () => {
    const [shifts, settings, meta, dayNotes] = await Promise.all([
      db.shifts.orderBy('start.raw').toArray(),
      db.kv.get(SETTINGS_KEY),
      db.kv.get(META_KEY),
      db.dayNotes.toArray(),
    ]);
    return {
      shifts,
      settings: settings?.value,
      meta: { ...defaultMeta(), ...((meta?.value as Partial<Meta> | undefined) ?? {}) },
      dayNotes,
    };
  });
}

export const putShift = (shift: Shift) => db.shifts.put(shift);
export const deleteShift = (id: string) => db.shifts.delete(id);
export const putDayNote = (note: DayNote) => db.dayNotes.put(note);

/** Delete finished shifts and day notes before `firstKeptDay` (yyyy-MM-dd). */
export async function deleteBefore(firstKeptDay: string, shiftIds: string[]): Promise<void> {
  await db.transaction('rw', db.shifts, db.dayNotes, async () => {
    await db.shifts.bulkDelete(shiftIds);
    await db.dayNotes.where('date').below(firstKeptDay).delete();
  });
}
export const deleteDayNote = (date: string) => db.dayNotes.delete(date);
export const saveSettings = (settings: Settings) =>
  db.kv.put({ key: SETTINGS_KEY, value: settings });
export const saveMeta = (meta: Meta) => db.kv.put({ key: META_KEY, value: meta });

export const queueEntries = (entries: OutboxEntry[]) => db.outbox.bulkPut(entries);
export const outboxEntries = () => db.outbox.orderBy('queuedAt').toArray();
export const outboxCount = () => db.outbox.count();

/** Remove a delivered entry unless it was replaced by a newer state meanwhile. */
export async function removeDelivered(entry: OutboxEntry): Promise<void> {
  await db.transaction('rw', db.outbox, async () => {
    const cur = await db.outbox.get(entry.key);
    if (cur && cur.queuedAt === entry.queuedAt) await db.outbox.delete(entry.key);
  });
}

/** Atomically replace all shifts and day notes (and optionally settings), e.g. on restore. */
export async function replaceAll(
  shifts: Shift[],
  dayNotes: DayNote[],
  settings?: Settings,
): Promise<void> {
  await db.transaction('rw', db.shifts, db.kv, db.dayNotes, async () => {
    await db.shifts.clear();
    await db.shifts.bulkPut(shifts);
    await db.dayNotes.clear();
    await db.dayNotes.bulkPut(dayNotes);
    if (settings) await db.kv.put({ key: SETTINGS_KEY, value: settings });
  });
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.shifts, db.kv, db.dayNotes, async () => {
    await db.shifts.clear();
    await db.kv.clear();
    await db.dayNotes.clear();
  });
}
