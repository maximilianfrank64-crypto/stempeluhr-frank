import { create } from 'zustand';
import { SYNC_URL } from '../config';
import { recentAddresses } from '../core/addresses';
import { mergeDayNotes, mergeShifts, retentionStart } from '../core/backup';
import { dayKey } from '../core/periods';
import * as punch from '../core/punch';
import { NO_ROUNDING } from '../core/rounding';
import { defaultSettings, detectLanguage, sanitizeSettings } from '../core/settings';
import {
  backlogItems,
  dayNoteItem,
  itemKey,
  shiftItem,
  syncConfigured,
  syncMessage,
  type SyncItem,
} from '../core/sync';
import type { DayNote, Rapport, Settings, Shift } from '../core/types';
import * as repo from '../db/db';
import type { Meta } from '../db/db';
import { currentLocation } from '../sync/geo';
import { sendMessage } from '../sync/send';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

export interface SyncState {
  /** Records waiting to be delivered. */
  pending: number;
  /** Reason of the last failed attempt ('offline', 'auth', 'HTTP 500' …); null after success. */
  lastError: string | null;
}

interface AppState {
  ready: boolean;
  loadError: string | null;
  shifts: Shift[];
  /** Day notes keyed by yyyy-MM-dd. */
  dayNotes: Record<string, DayNote>;
  settings: Settings;
  meta: Meta;
  sync: SyncState;
  toasts: Toast[];

  init: () => Promise<void>;
  /** Try to deliver everything in the outbox (no-op when sending is not set up). */
  flushOutbox: () => Promise<void>;
  /**
   * Regular upkeep (app start, every minute): end a shift nobody punched out of
   * at 23:59, and remove entries older than two years from the phone.
   */
  housekeeping: () => Promise<void>;
  punchIn: () => Promise<void>;
  punchOut: () => Promise<void>;
  startBreak: () => Promise<void>;
  endBreak: () => Promise<void>;
  saveShift: (shift: Shift) => Promise<void>;
  removeShift: (id: string) => Promise<void>;
  /**
   * Set the note for a day; `rapport` and `address` set those answers (omitted = keep them).
   * Empty text without a Rapport answer and without an address removes the note.
   */
  setDayNote: (
    date: string,
    text: string,
    rapport?: Rapport,
    address?: string,
  ) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  restore: (
    backup: { shifts: Shift[]; dayNotes: DayNote[]; settings: Settings | null },
    mode: 'merge' | 'replace',
  ) => Promise<number>;
  updateMeta: (patch: Partial<Meta>) => Promise<void>;
  deleteEverything: () => Promise<void>;
  toast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
}

// Company app: German unless someone switches it in Settings.
const browserLanguage = () => detectLanguage(['de']);

const byDate = (notes: DayNote[]) => Object.fromEntries(notes.map((n) => [n.date, n]));

const sortShifts = (shifts: Shift[]) => [...shifts].sort((a, b) => a.start.raw - b.start.raw);

export const selectActive = (s: Pick<AppState, 'shifts'>): Shift | undefined =>
  s.shifts.find((x) => x.end === null);

let toastId = 0;
let flushing = false;
let flushAgain = false;
/** Strictly increasing, so a newer outbox entry is always told apart from the one being sent. */
let lastQueuedAt = 0;
const nextQueuedAt = () => (lastQueuedAt = Math.max(Date.now(), lastQueuedAt + 1));

export const useApp = create<AppState>()((set, get) => {
  const putAndPublish = async (next: Shift) => {
    await repo.putShift(next);
    set((s) => ({ shifts: sortShifts([...s.shifts.filter((x) => x.id !== next.id), next]) }));
  };

  /** Apply a punch transition: compute, persist immediately, then publish. */
  const transition = async (fn: (active: Shift | undefined, now: number) => Shift) => {
    const next = fn(selectActive(get()), Date.now());
    await putAndPublish(next);
    return next;
  };

  /** Put records into the outbox and try to send them right away. */
  const queue = async (items: SyncItem[]) => {
    if (items.length === 0 || !syncConfigured(get().settings.company, SYNC_URL)) return;
    await repo.queueEntries(
      items.map((item) => ({ key: itemKey(item), item, queuedAt: nextQueuedAt() })),
    );
    const pending = await repo.outboxCount();
    set((s) => ({ sync: { ...s.sync, pending } }));
    void get().flushOutbox();
  };

  const queueShift = (shift: Shift) => queue([shiftItem(shift, get().settings, Date.now())]);

  /**
   * Record where the phone is for a punch (always, once sending is set up). Runs
   * after the punch is saved, so a slow, missing or refused GPS fix never delays
   * or blocks punching; a refusal is recorded and shows up in the office report.
   */
  const locate = async (id: string, field: 'startLocation' | 'endLocation') => {
    if (!syncConfigured(get().settings.company, SYNC_URL)) return;
    const location = await currentLocation();
    const cur = get().shifts.find((x) => x.id === id);
    if (!cur) return;
    const next = { ...cur, [field]: location };
    await putAndPublish(next);
    await queueShift(next);
  };

  const guard =
    <A extends unknown[]>(fn: (...a: A) => Promise<void>) =>
    async (...a: A) => {
      try {
        await fn(...a);
      } catch (e) {
        // A PunchError means the state already changed (e.g. a double tap): nothing to report.
        if (e instanceof punch.PunchError) return;
        get().toast(e instanceof Error ? e.message : String(e), 'error');
      }
    };

  return {
    ready: false,
    loadError: null,
    shifts: [],
    dayNotes: {},
    settings: defaultSettings(browserLanguage()),
    meta: repo.defaultMeta(),
    sync: { pending: 0, lastError: null },
    toasts: [],

    init: async () => {
      try {
        const data = await repo.loadAll();
        const settings = sanitizeSettings(data.settings, defaultSettings(browserLanguage()));
        const meta = data.meta.deviceId ? data.meta : { ...data.meta, deviceId: punch.newId() };
        if (meta !== data.meta) await repo.saveMeta(meta);
        set({
          ready: true,
          shifts: sortShifts(data.shifts),
          dayNotes: byDate(data.dayNotes),
          settings,
          meta,
          sync: { pending: await repo.outboxCount(), lastError: null },
        });
        await get().housekeeping();
        void get().flushOutbox();
      } catch (e) {
        // e.g. IndexedDB blocked in a private window: show the app, report the problem.
        set({ ready: true, loadError: e instanceof Error ? e.message : String(e) });
      }
    },

    flushOutbox: async () => {
      const { company } = get().settings;
      if (!syncConfigured(company, SYNC_URL)) return;
      if (flushing) {
        // Something was queued while sending: go round once more when done.
        flushAgain = true;
        return;
      }
      flushing = true;
      flushAgain = false;
      let lastError: string | null = null;
      let sent = 0;
      try {
        const deviceId = get().meta.deviceId ?? '';
        for (const entry of await repo.outboxEntries()) {
          await sendMessage(
            SYNC_URL,
            company.accessKey,
            syncMessage(entry.item, company, deviceId, Date.now()),
          );
          await repo.removeDelivered(entry);
          sent++;
        }
      } catch (e) {
        // Stays in the outbox; the next flush (app opened, back online, timer) retries.
        lastError = e instanceof Error ? e.message : String(e);
      } finally {
        flushing = false;
      }
      if (sent > 0) await get().updateMeta({ lastSyncAt: Date.now() });
      set({ sync: { pending: await repo.outboxCount(), lastError } });
      if (flushAgain && lastError === null) await get().flushOutbox();
    },

    housekeeping: guard(async () => {
      const now = Date.now();
      const closed = punch.autoCloseStale(selectActive(get()), now, NO_ROUNDING);
      if (closed) {
        await putAndPublish(closed);
        await queueShift(closed);
      }
      // Only the phone's copy is cleaned up; nothing is sent, the office keeps its records.
      const firstKept = retentionStart(now);
      const old = get().shifts.filter((s) => s.end !== null && dayKey(s.start.raw) < firstKept);
      if (old.length > 0 || Object.keys(get().dayNotes).some((d) => d < firstKept)) {
        await repo.deleteBefore(
          firstKept,
          old.map((s) => s.id),
        );
        set((s) => ({
          shifts: s.shifts.filter((x) => !old.includes(x)),
          dayNotes: Object.fromEntries(Object.entries(s.dayNotes).filter(([d]) => d >= firstKept)),
        }));
      }
    }),

    punchIn: guard(async () => {
      const next = await transition((a, now) => punch.punchIn(a, now, NO_ROUNDING));
      // The job site stays from day to day (often a whole week); the report of the work does not.
      const day = dayKey(next.start.raw);
      const today = get().dayNotes[day];
      const lastAddress = recentAddresses(get().dayNotes, 1)[0];
      if (!today?.address && lastAddress) {
        await get().setDayNote(day, today?.text ?? '', undefined, lastAddress);
      }
      await queueShift(next);
      void locate(next.id, 'startLocation');
    }),
    punchOut: guard(async () => {
      const next = await transition((a, now) => punch.punchOut(a, now, NO_ROUNDING));
      await queueShift(next);
      void locate(next.id, 'endLocation');
    }),
    startBreak: guard(async () => {
      await queueShift(await transition((a, now) => punch.startBreak(a, now, NO_ROUNDING)));
    }),
    endBreak: guard(async () => {
      await queueShift(await transition((a, now) => punch.endBreak(a, now, NO_ROUNDING)));
    }),

    saveShift: guard(async (shift) => {
      const next = punch.normalizeShift({ ...shift, updatedAt: Date.now() });
      await putAndPublish(next);
      await queueShift(next);
    }),

    removeShift: guard(async (id) => {
      await repo.deleteShift(id);
      set((s) => ({ shifts: s.shifts.filter((x) => x.id !== id) }));
      await queue([{ kind: 'shiftDeleted', id }]);
    }),

    setDayNote: guard(async (date, text, rapport, address) => {
      const clean = text.trim();
      const kept = rapport ?? get().dayNotes[date]?.rapport;
      const addr = (address ?? get().dayNotes[date]?.address ?? '').trim().slice(0, 200);
      if (clean === '' && !kept && addr === '') {
        await repo.deleteDayNote(date);
        set((s) => {
          const rest = { ...s.dayNotes };
          delete rest[date];
          return { dayNotes: rest };
        });
      } else {
        const note: DayNote = {
          date,
          text: clean,
          ...(addr !== '' && { address: addr }),
          ...(kept && { rapport: kept }),
          updatedAt: Date.now(),
        };
        await repo.putDayNote(note);
        set((s) => ({ dayNotes: { ...s.dayNotes, [date]: note } }));
      }
      await queue([dayNoteItem(date, get().dayNotes[date])]);
    }),

    updateSettings: guard(async (patch) => {
      const before = get().settings;
      const settings = sanitizeSettings({ ...before, ...patch }, before);
      await repo.saveSettings(settings);
      set({ settings });
      // Sending just got switched on: deliver this and last month so the office has full periods.
      if (!syncConfigured(before.company, SYNC_URL) && syncConfigured(settings.company, SYNC_URL)) {
        const { shifts, dayNotes } = get();
        await queue(backlogItems(shifts, dayNotes, settings, Date.now()));
      }
    }),

    restore: async (backup, mode) => {
      const replace = mode === 'replace';
      const shifts = replace ? backup.shifts : mergeShifts(get().shifts, backup.shifts);
      const notes = replace
        ? backup.dayNotes
        : mergeDayNotes(Object.values(get().dayNotes), backup.dayNotes);
      const nextSettings = replace && backup.settings ? backup.settings : get().settings;
      await repo.replaceAll(shifts, notes, nextSettings);
      set({ shifts: sortShifts(shifts), dayNotes: byDate(notes), settings: nextSettings });
      return backup.shifts.length;
    },

    updateMeta: async (patch) => {
      const meta = { ...get().meta, ...patch };
      await repo.saveMeta(meta);
      set({ meta });
    },

    deleteEverything: guard(async () => {
      // Keeps the outbox: what was already recorded still reaches the office.
      const deviceId = get().meta.deviceId;
      await repo.clearAll();
      const meta = { ...repo.defaultMeta(), deviceId };
      await repo.saveMeta(meta);
      set({ shifts: [], dayNotes: {}, settings: defaultSettings(get().settings.language), meta });
    }),

    toast: (message, kind = 'info') => {
      const id = ++toastId;
      set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});
