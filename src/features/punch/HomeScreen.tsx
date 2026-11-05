import { useMemo, useState } from 'react';
import { calcShift } from '../../core/calc';
import { formatClock, formatDuration, formatTime } from '../../core/format';
import { getStatus, openBreak } from '../../core/punch';
import { buildReport } from '../../core/report';
import { dayKey, periodRange } from '../../core/periods';
import type { Stamp } from '../../core/types';
import { selectActive, useApp } from '../../store/appStore';
import { useNow, useSettings, useT } from '../../ui/hooks';
import { Icon } from '../../ui/icons';
import { needsPunchOutAnswers } from '../../core/sync';
import { DayAddressField, DayNoteField, PunchOutDialog } from '../daynote/DayNote';
import { SyncStatus } from '../sync/SyncStatus';

function StampTime({ stamp, timeFormat }: { stamp: Stamp; timeFormat: '12h' | '24h' }) {
  const t = useT();
  const rounded = formatTime(stamp.rounded, timeFormat);
  const raw = formatTime(stamp.raw, timeFormat);
  return (
    <>
      {rounded}
      {rounded !== raw && (
        <span className="muted small"> ({t('punch.rounded', { time: raw })})</span>
      )}
    </>
  );
}

export function HomeScreen() {
  const t = useT();
  const settings = useSettings();
  const shifts = useApp((s) => s.shifts);
  const active = useApp(selectActive);
  const { punchIn, punchOut, startBreak, endBreak, setDayNote } = useApp.getState();
  const [busy, setBusy] = useState(false);
  const [askNote, setAskNote] = useState(false);
  const status = getStatus(active);
  const now = useNow(1000);
  // The note belongs to the day the shift started (matters for night shifts).
  const noteDate = dayKey(active ? active.start.raw : now);
  const mustAsk = useApp((s) => needsPunchOutAnswers(s.dayNotes[noteDate]));

  const run = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      navigator.vibrate?.(15);
    } finally {
      setBusy(false);
    }
  };

  // The big timer shows real elapsed time (a rounded-up start would make it look frozen);
  // today/week totals below use the report rules (rounding, auto-break).
  const current = active ? calcShift(active, { useRaw: true, now }) : null;
  const currentBreak = active ? openBreak(active) : undefined;

  const minuteNow = Math.floor(now / 60_000);
  const { today, week } = useMemo(() => {
    const ts = minuteNow * 60_000;
    return {
      today: buildReport(shifts, periodRange('day', ts, settings.weekStartsOn), settings, ts).total,
      week: buildReport(shifts, periodRange('week', ts, settings.weekStartsOn), settings, ts).total,
    };
  }, [shifts, settings, minuteNow]);

  const dur = (ms: number, signed = false) =>
    formatDuration(ms, settings.durationStyle, { lang: settings.language, signed });

  const last = shifts[shifts.length - 1];

  return (
    <div className={`home state-${status}`}>
      <div className="status-pill" role="status" aria-live="polite">
        <span className="dot" aria-hidden="true" />
        {t(`status.${status}`)}
      </div>

      <div className="timer" aria-label={t('punch.shift')}>
        <div className="timer-value" aria-live="off">
          {current ? formatClock(current.netMs) : formatClock(0)}
        </div>
        <div className="timer-sub">
          {active ? (
            <>
              {t('punch.since')} <StampTime stamp={active.start} timeFormat={settings.timeFormat} />
            </>
          ) : last?.end ? (
            t('punch.lastPunch', {
              event: t('punch.event.out'),
              time: formatTime(last.end.rounded, settings.timeFormat),
            })
          ) : (
            '\u00A0'
          )}
        </div>
        {currentBreak && (
          <div className="break-timer">
            <Icon name="coffee" width={18} height={18} /> {t('punch.breakTime')}{' '}
            {formatClock(now - currentBreak.start.raw)}
          </div>
        )}
      </div>

      <div className="punch-buttons">
        {status === 'off' ? (
          <button
            type="button"
            className="punch-btn punch-in"
            onClick={run(punchIn)}
            disabled={busy}
          >
            <Icon name="play" width={40} height={40} />
            <span>{t('punch.in')}</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              className="punch-btn punch-out"
              onClick={mustAsk ? () => setAskNote(true) : run(punchOut)}
              disabled={busy}
            >
              <Icon name="stop" width={36} height={36} />
              <span>{t('punch.out')}</span>
            </button>
            <button
              type="button"
              className={`punch-btn punch-break ${status === 'break' ? 'is-on-break' : ''}`}
              onClick={run(status === 'break' ? endBreak : startBreak)}
              disabled={busy}
              aria-pressed={status === 'break'}
            >
              <Icon name={status === 'break' ? 'play' : 'coffee'} width={32} height={32} />
              <span>{status === 'break' ? t('punch.breakEnd') : t('punch.breakStart')}</span>
            </button>
          </>
        )}
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-label">{t('punch.today')}</span>
          <span className="stat-value">{dur(today.netMs)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('punch.week')}</span>
          <span className="stat-value">{dur(week.netMs)}</span>
        </div>
        {current && current.breakMs > 0 && (
          <div className="stat">
            <span className="stat-label">{t('punch.breakTime')}</span>
            <span className="stat-value">{dur(current.breakMs)}</span>
          </div>
        )}
      </div>

      <DayAddressField date={noteDate} />
      <DayNoteField date={noteDate} label={t('daynote.today')} />
      <SyncStatus />

      <PunchOutDialog
        date={noteDate}
        open={askNote}
        onCancel={() => setAskNote(false)}
        onConfirm={(text, rapport, address) => {
          setAskNote(false);
          void run(async () => {
            await setDayNote(noteDate, text, rapport, address);
            await punchOut();
          })();
        }}
      />
    </div>
  );
}
