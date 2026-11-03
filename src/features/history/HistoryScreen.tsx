import { useMemo, useState } from 'react';
import {
  crossesMidnight,
  formatDate,
  formatDateLong,
  formatDayShort,
  formatDuration,
  formatMonth,
  formatTime,
} from '../../core/format';
import { dayKey, periodRange, shiftPeriod, weekNumber, type PeriodUnit } from '../../core/periods';
import { buildReport } from '../../core/report';
import type { Shift } from '../../core/types';
import { useApp } from '../../store/appStore';
import { EmptyState } from '../../ui/components';
import { useNow, useSettings, useT } from '../../ui/hooks';
import { Icon } from '../../ui/icons';
import { DayNoteDialog } from '../daynote/DayNote';
import { ShiftEditor } from './ShiftEditor';

const UNITS: PeriodUnit[] = ['day', 'week', 'month'];

export function HistoryScreen() {
  const t = useT();
  const settings = useSettings();
  const shifts = useApp((s) => s.shifts);
  const dayNotes = useApp((s) => s.dayNotes);
  const [unit, setUnit] = useState<PeriodUnit>('week');
  const [ref, setRef] = useState(() => Date.now());
  const [editing, setEditing] = useState<{ shift: Shift | undefined } | null>(null);
  const [noteDate, setNoteDate] = useState<string | null>(null);
  const now = useNow(30_000);
  const lang = settings.language;

  const range = periodRange(unit, ref, settings.weekStartsOn);
  const report = useMemo(
    () => buildReport(shifts, range, settings, now, dayNotes),
    // range is derived from unit/ref/weekStartsOn
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shifts, dayNotes, settings, now, range.from, range.to],
  );
  const byId = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const containsToday = range.from <= dayKey(now) && dayKey(now) <= range.to;

  const title =
    unit === 'day'
      ? formatDateLong(range.from, lang)
      : unit === 'week'
        ? `${t('history.weekNo', { n: weekNumber(ref, settings.weekStartsOn) })} · ${formatDate(range.from, lang)} – ${formatDate(range.to, lang)}`
        : formatMonth(ref, lang);

  const dur = (ms: number, signed = false) =>
    formatDuration(ms, settings.durationStyle, { lang, signed });
  const tot = report.total;

  return (
    <div className="screen history">
      <div className="segmented" role="tablist" aria-label={t('history.title')}>
        {UNITS.map((u) => (
          <button
            key={u}
            type="button"
            role="tab"
            aria-selected={unit === u}
            className={unit === u ? 'active' : undefined}
            onClick={() => setUnit(u)}
          >
            {t(`history.${u}`)}
          </button>
        ))}
      </div>

      <div className="period-nav">
        <button
          type="button"
          className="icon-btn"
          aria-label={t('history.prev')}
          onClick={() => setRef((r) => shiftPeriod(unit, r, -1))}
        >
          <Icon name="left" />
        </button>
        <div className="period-title">
          <h2 aria-live="polite">{title}</h2>
          {!containsToday && (
            <button type="button" className="link-btn small" onClick={() => setRef(Date.now())}>
              {t('history.thisPeriod')}
            </button>
          )}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('history.next')}
          onClick={() => setRef((r) => shiftPeriod(unit, r, 1))}
        >
          <Icon name="right" />
        </button>
      </div>

      <div className="summary card">
        <div>
          <span className="stat-label">{t('history.total')}</span>
          <span className="stat-value">{dur(tot.netMs)}</span>
        </div>
        <div>
          <span className="stat-label">{t('export.labels.breaks')}</span>
          <span className="stat-value small">{dur(tot.breakMs)}</span>
        </div>
      </div>

      {report.listedDays.length === 0 ? (
        <EmptyState
          icon="history"
          title={t('history.empty')}
          hint={t('history.emptyHint')}
          action={
            unit === 'day' ? (
              <button type="button" className="btn" onClick={() => setNoteDate(range.from)}>
                <Icon name="note" width={18} height={18} /> {t('daynote.add')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <ol className="day-list">
          {[...report.listedDays].reverse().map((day) => (
            <li key={day.date} className="day card">
              <div className="day-head">
                <h3>{formatDayShort(day.date, lang)}</h3>
                <span className="day-head-actions">
                  {!day.note && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('daynote.add')}
                      title={t('daynote.add')}
                      onClick={() => setNoteDate(day.date)}
                    >
                      <Icon name="note" width={18} height={18} />
                    </button>
                  )}
                  {day.shiftCount > 0 && <span className="day-total">{dur(day.netMs)}</span>}
                </span>
              </div>
              {day.note && (
                <button
                  type="button"
                  className="day-note"
                  aria-label={`${t('daynote.edit')}: ${day.note}`}
                  onClick={() => setNoteDate(day.date)}
                >
                  <Icon name="note" width={16} height={16} />
                  <span>{day.note}</span>
                </button>
              )}
              <ul className="shift-list">
                {day.shifts.map((row) => {
                  const shift = byId.get(row.id);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="shift-row"
                        onClick={() => setEditing({ shift })}
                        aria-label={`${t('common.edit')}: ${formatTime(row.start, settings.timeFormat)} – ${row.end === null ? t('history.running') : formatTime(row.end, settings.timeFormat)}`}
                      >
                        <span className="shift-times">
                          {formatTime(row.start, settings.timeFormat)} –{' '}
                          {row.end === null ? (
                            <span className="running">{t('history.running')}</span>
                          ) : (
                            <>
                              {formatTime(row.end, settings.timeFormat)}
                              {crossesMidnight(row.start, row.end) && <sup> +1</sup>}
                            </>
                          )}
                        </span>
                        <span className="shift-meta">
                          {row.breakMs > 0 && (
                            <span className="muted">
                              <Icon name="coffee" width={14} height={14} /> {dur(row.breakMs)}
                            </span>
                          )}
                          {shift?.source === 'manual' && (
                            <span className="badge">{t('history.manual')}</span>
                          )}
                          {shift?.autoClosed && (
                            <span className="badge warn">{t('history.autoClosed')}</span>
                          )}
                        </span>
                        <span className="shift-dur">{dur(row.netMs)}</span>
                        {row.note && <span className="shift-note">{row.note}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        className="fab"
        onClick={() => setEditing({ shift: undefined })}
        aria-label={t('history.addEntry')}
      >
        <Icon name="plus" />
        <span>{t('history.addEntry')}</span>
      </button>

      <DayNoteDialog date={noteDate} onClose={() => setNoteDate(null)} />

      <ShiftEditor
        open={editing !== null}
        shift={editing?.shift}
        defaultDate={unit === 'day' ? range.from : containsToday ? dayKey(now) : range.from}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
