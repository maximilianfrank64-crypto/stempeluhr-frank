import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStatus } from '../core/punch';
import type { SyncMessage } from '../core/sync';
import { db, loadAll } from '../db/db';
import { HOUR, shift } from '../test/helpers';
import { selectActive, useApp } from './appStore';

vi.mock('../config', () => ({
  SYNC_URL: 'https://n8n.test/webhook/stempel',
  SYNC_AUTH_HEADER: 'X-Stempel-Key',
}));

describe('app store persistence', () => {
  beforeEach(async () => {
    await db.shifts.clear();
    await db.kv.clear();
    await db.dayNotes.clear();
    await db.outbox.clear();
    await useApp.getState().init();
  });

  it('persists the active session immediately on every punch', async () => {
    await useApp.getState().punchIn();
    let stored = await loadAll();
    expect(stored.shifts).toHaveLength(1);
    expect(stored.shifts[0]!.end).toBeNull();

    await useApp.getState().startBreak();
    stored = await loadAll();
    expect(getStatus(stored.shifts[0])).toBe('break');

    // Simulate an app restart: reload state from IndexedDB.
    useApp.setState({ shifts: [] });
    await useApp.getState().init();
    expect(getStatus(selectActive(useApp.getState()))).toBe('break');

    await useApp.getState().punchOut();
    stored = await loadAll();
    expect(getStatus(stored.shifts[0])).toBe('off');
    expect(stored.shifts[0]!.breaks[0]!.end).not.toBeNull();
  });

  it('day notes are saved, trimmed, survive a restart, and empty text removes them', async () => {
    await useApp.getState().setDayNote('2026-10-14', '  Release day  ');
    expect((await loadAll()).dayNotes).toEqual([
      expect.objectContaining({ date: '2026-10-14', text: 'Release day' }),
    ]);
    useApp.setState({ dayNotes: {} });
    await useApp.getState().init();
    expect(useApp.getState().dayNotes['2026-10-14']?.text).toBe('Release day');

    await useApp.getState().setDayNote('2026-10-14', '   ');
    expect((await loadAll()).dayNotes).toHaveLength(0);
    expect(useApp.getState().dayNotes['2026-10-14']).toBeUndefined();
  });

  it('double punch-in is ignored, not duplicated', async () => {
    await useApp.getState().punchIn();
    await useApp.getState().punchIn();
    expect((await loadAll()).shifts).toHaveLength(1);
  });

  it('settings round-trip through IndexedDB', async () => {
    await useApp.getState().updateSettings({ timeFormat: '24h', language: 'de' });
    useApp.setState({ ready: false });
    await useApp.getState().init();
    expect(useApp.getState().settings.timeFormat).toBe('24h');
    expect(useApp.getState().settings.language).toBe('de');
  });

  it('delete everything clears the database', async () => {
    await useApp.getState().punchIn();
    await useApp.getState().deleteEverything();
    expect((await loadAll()).shifts).toHaveLength(0);
    expect(useApp.getState().shifts).toHaveLength(0);
  });

  it('nothing is queued while sending is not set up', async () => {
    await useApp.getState().punchIn();
    await useApp.getState().setDayNote('2026-10-14', 'Müller');
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('sending to the office', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sent = () =>
    fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as SyncMessage);

  beforeEach(async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await db.shifts.clear();
    await db.kv.clear();
    await db.dayNotes.clear();
    await db.outbox.clear();
    await useApp.getState().init();
  });
  afterEach(() => vi.unstubAllGlobals());

  const setUp = () =>
    useApp.getState().updateSettings({
      company: { employeeName: 'Jonas Weber', accessKey: 'geheim' },
    });

  it('punches and notes are sent with name, device and key header', async () => {
    await setUp();
    await useApp.getState().punchIn();
    await useApp
      .getState()
      .setDayNote('2026-10-14', 'Müller, Esslingen', { done: false }, 'Hauptstr. 5, Esslingen');
    await vi.waitFor(async () => expect(await db.outbox.count()).toBe(0));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://n8n.test/webhook/stempel');
    expect((init?.headers as Record<string, string>)['X-Stempel-Key']).toBe('geheim');
    expect(sent()[0]).toMatchObject({ employee: 'Jonas Weber', deviceId: expect.any(String) });
    expect(sent().map((m) => m.item)).toContainEqual({
      kind: 'dayNote',
      date: '2026-10-14',
      text: 'Müller, Esslingen',
      address: 'Hauptstr. 5, Esslingen',
      rapport: { done: false },
    });
    // No GPS in the test runtime: recorded as such, never left out silently.
    expect(sent().some((m) => 'startLocation' in m.item && m.item.startLocation !== null)).toBe(
      true,
    );
  });

  it('a Rapport answer is kept when only the note text changes', async () => {
    await useApp.getState().setDayNote('2026-10-14', 'Müller', {
      done: true,
      hours: 1.5,
      text: 'Treppenhaus',
    });
    await useApp.getState().setDayNote('2026-10-14', 'Müller, Esslingen');
    expect(useApp.getState().dayNotes['2026-10-14']).toMatchObject({
      text: 'Müller, Esslingen',
      rapport: { done: true, hours: 1.5, text: 'Treppenhaus' },
    });
  });

  it('the address is kept when only the note changes, and an address alone is a note', async () => {
    await useApp.getState().setDayNote('2026-10-15', '', undefined, 'Rohrer Straße 85, Stuttgart');
    expect(useApp.getState().dayNotes['2026-10-15']).toMatchObject({
      address: 'Rohrer Straße 85, Stuttgart',
    });
    await useApp.getState().setDayNote('2026-10-15', 'Innenputz');
    expect(useApp.getState().dayNotes['2026-10-15']).toMatchObject({
      text: 'Innenputz',
      address: 'Rohrer Straße 85, Stuttgart',
    });
    await useApp.getState().setDayNote('2026-10-15', '', undefined, '');
    expect(useApp.getState().dayNotes['2026-10-15']).toBeUndefined();
  });

  it('keeps records when offline and sends only the newest state later', async () => {
    await setUp();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await useApp.getState().punchIn();
    await useApp.getState().punchOut();
    await vi.waitFor(() => expect(useApp.getState().sync.lastError).toBe('offline'));
    await vi.waitFor(async () => expect(await db.outbox.count()).toBe(1));

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await useApp.getState().flushOutbox();
    await vi.waitFor(() => expect(useApp.getState().sync).toEqual({ pending: 0, lastError: null }));
    expect(sent().at(-1)!.item).toMatchObject({ kind: 'shift', end: expect.any(String) });
  });

  it('a forgotten shift is ended at 23:59, marked and sent', async () => {
    await setUp();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(7, 0, 0, 0);
    await db.shifts.put(shift(yesterday.getTime(), null, [], { id: 'vergessen' }));
    await useApp.getState().init();
    const s = useApp.getState().shifts.find((x) => x.id === 'vergessen')!;
    expect(s.autoClosed).toBe(true);
    expect(new Date(s.end!.raw).getHours() * 60 + new Date(s.end!.raw).getMinutes()).toBe(
      23 * 60 + 59,
    );
    await vi.waitFor(() =>
      expect(sent().map((m) => m.item)).toContainEqual(
        expect.objectContaining({ id: 'vergessen', autoClosed: true }),
      ),
    );
  });

  it('entries older than two years are removed from the phone only', async () => {
    await setUp();
    const old = new Date();
    old.setFullYear(old.getFullYear() - 2);
    old.setDate(old.getDate() - 3);
    old.setHours(8, 0, 0, 0);
    const recent = new Date();
    recent.setDate(recent.getDate() - 3);
    recent.setHours(8, 0, 0, 0);
    await db.shifts.bulkPut([
      shift(old.getTime(), old.getTime() + HOUR, [], { id: 'alt' }),
      shift(recent.getTime(), recent.getTime() + HOUR, [], { id: 'neu' }),
    ]);
    fetchMock.mockClear();
    await useApp.getState().init();
    expect(useApp.getState().shifts.map((s) => s.id)).toEqual(['neu']);
    expect((await loadAll()).shifts.map((s) => s.id)).toEqual(['neu']);
    expect(sent().filter((m) => m.item.kind === 'shiftDeleted')).toHaveLength(0);
  });

  it('switching sending on delivers the entries already on the phone', async () => {
    await useApp.getState().punchIn();
    await useApp.getState().punchOut();
    await setUp();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent()[0]!.item.kind).toBe('shift');
  });

  it('always records the location at punch in once set up', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({
        coords: { latitude: 48.7758123, longitude: 9.1829456, accuracy: 8.4 },
        timestamp: 1,
      } as GeolocationPosition),
    );
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    await setUp();
    await useApp.getState().punchIn();
    await vi.waitFor(() =>
      expect(selectActive(useApp.getState())?.startLocation).toEqual({
        lat: 48.775812,
        lon: 9.182946,
        accuracyM: 8,
        at: 1,
      }),
    );
    await vi.waitFor(() =>
      expect(sent().at(-1)!.item).toMatchObject({ startLocation: { lat: 48.775812 } }),
    );
  });
});
