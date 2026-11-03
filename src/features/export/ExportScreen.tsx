import { useEffect, useMemo, useState } from 'react';
import { buildExport, type ExportFile } from '../../core/export';
import { formatDate, formatDuration } from '../../core/format';
import { dayKey, isValidDayKey, presetRange } from '../../core/periods';
import { buildReport } from '../../core/report';
import { EXPORT_FORMATS, RANGE_PRESETS } from '../../core/settings';
import type { DateRange, ExportFormat, RangePreset } from '../../core/types';
import { exportLabels } from '../../i18n';
import { useApp } from '../../store/appStore';
import { Section, SelectField } from '../../ui/components';
import { useSettings, useT } from '../../ui/hooks';
import { Icon } from '../../ui/icons';
import { canShareFiles, deliverFile } from './share';

export function ExportScreen() {
  const t = useT();
  const settings = useSettings();
  const shifts = useApp((s) => s.shifts);
  const dayNotes = useApp((s) => s.dayNotes);
  const toast = useApp((s) => s.toast);
  const [preset, setPreset] = useState<RangePreset>(settings.exportRange);
  const [format, setFormat] = useState<ExportFormat>(settings.exportFormat);
  const today = dayKey(Date.now());
  const [custom, setCustom] = useState<DateRange>(() =>
    presetRange('thisMonth', Date.now(), settings.weekStartsOn),
  );
  const [file, setFile] = useState<ExportFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shareSupported = useMemo(canShareFiles, []);

  const range = useMemo(() => {
    const r = presetRange(preset, Date.now(), settings.weekStartsOn, {
      custom,
      firstDataMs: shifts[0]?.start.rounded,
    });
    return r.from <= r.to ? r : { from: r.to, to: r.from };
    // `today` makes the range follow the date if the app stays open past midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, custom, settings.weekStartsOn, shifts, today]);

  const report = useMemo(
    () => buildReport(shifts, range, settings, Date.now(), dayNotes),
    [shifts, dayNotes, range, settings],
  );

  // Build the file ahead of the tap: iOS only allows the share sheet directly
  // after a user gesture, so there must be no slow async work in between.
  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setError(null);
    buildExport(format, report, {
      lang: settings.language,
      timeFormat: settings.timeFormat,
      durationStyle: settings.durationStyle,
      labels: exportLabels(settings.language),
    })
      .then((f) => !cancelled && setFile(f))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [format, report, settings.language, settings.timeFormat, settings.durationStyle]);

  const deliver = async (how: 'share' | 'download') => {
    if (!file) return;
    const res = await deliverFile(file.data, file.filename, file.mime, how);
    if (res !== 'cancelled') toast(t('export.done', { name: file.filename }));
  };

  const dur = (ms: number) =>
    formatDuration(ms, settings.durationStyle, { lang: settings.language });

  return (
    <div className="screen export">
      <Section title={t('export.range')} id="x-range">
        <SelectField
          label={t('export.range')}
          value={preset}
          options={RANGE_PRESETS.map((r) => ({ value: r, label: t(`range.${r}`) }))}
          onChange={setPreset}
        />
        {preset === 'custom' && (
          <div className="row-2">
            <div className="field">
              <label htmlFor="x-from">{t('export.from')}</label>
              <input
                id="x-from"
                type="date"
                value={custom.from}
                onChange={(e) =>
                  isValidDayKey(e.target.value) &&
                  setCustom((c) => ({ ...c, from: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="x-to">{t('export.to')}</label>
              <input
                id="x-to"
                type="date"
                value={custom.to}
                onChange={(e) =>
                  isValidDayKey(e.target.value) && setCustom((c) => ({ ...c, to: e.target.value }))
                }
              />
            </div>
          </div>
        )}
        <p className="muted small">
          {formatDate(range.from, settings.language)} – {formatDate(range.to, settings.language)}
        </p>
      </Section>

      <Section title={t('export.format')} id="x-format">
        <div className="radio-list" role="radiogroup" aria-labelledby="x-format">
          {EXPORT_FORMATS.map((f) => (
            <label key={f} className={`radio ${format === f ? 'on' : ''}`}>
              <input
                type="radio"
                name="format"
                value={f}
                checked={format === f}
                onChange={() => setFormat(f)}
              />
              <span>{t(`export.format.${f}`)}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title={t('export.preview')} id="x-preview">
        <div className="summary">
          <div>
            <span className="stat-label">{t('export.labels.worked')}</span>
            <span className="stat-value">{dur(report.total.netMs)}</span>
          </div>
          <div>
            <span className="stat-label">{t('export.labels.breaks')}</span>
            <span className="stat-value small">{dur(report.total.breakMs)}</span>
          </div>
          <div>
            <span className="stat-label">{t('export.labels.shifts')}</span>
            <span className="stat-value small">{report.total.shiftCount}</span>
          </div>
        </div>
        <p className="muted small">{t('export.days', { n: report.listedDays.length })}</p>
      </Section>

      {error && (
        <p className="error" role="alert">
          {t('common.error', { message: error })}
        </p>
      )}
      {!shareSupported && <p className="muted small">{t('export.shareUnsupported')}</p>}

      <div className="actions sticky-actions">
        {shareSupported && (
          <button
            type="button"
            className="btn btn-primary btn-large"
            disabled={!file}
            onClick={() => void deliver('share')}
          >
            <Icon name="share" /> {t('export.share')}
          </button>
        )}
        <button
          type="button"
          className={`btn btn-large ${shareSupported ? '' : 'btn-primary'}`}
          disabled={!file}
          onClick={() => void deliver('download')}
        >
          <Icon name="download" /> {t('export.download')}
        </button>
      </div>
    </div>
  );
}
