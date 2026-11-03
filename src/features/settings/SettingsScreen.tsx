import { useEffect, useState } from 'react';
import { SYNC_URL } from '../../config';
import { EXPORT_FORMATS, RANGE_PRESETS } from '../../core/settings';
import { syncConfigured } from '../../core/sync';
import type { Settings, WeekDay } from '../../core/types';
import { LANGUAGES, weekdayNames } from '../../i18n';
import { useApp } from '../../store/appStore';
import { currentLocation } from '../../sync/geo';
import {
  ConfirmDialog,
  NumberField,
  Section,
  SelectField,
  Switch,
  TextField,
} from '../../ui/components';
import { useSettings, useT } from '../../ui/hooks';
import { navigate } from '../../ui/router';
import {
  formatBytes,
  persistenceStatus,
  requestPersistence,
  storageUsage,
  type PersistStatus,
} from '../backup/storage';

function StorageStatus() {
  const t = useT();
  const [status, setStatus] = useState<PersistStatus | null>(null);
  const [usage, setUsage] = useState<number | null>(null);
  useEffect(() => {
    void persistenceStatus().then(setStatus);
    void storageUsage().then(setUsage);
  }, []);
  if (!status) return null;
  return (
    <div className="storage-status">
      <p>
        <strong>{t('settings.storage')}: </strong>
        <span className={status === 'granted' ? 'ok' : 'warn'}>
          {t(`settings.storage.${status}`)}
        </span>
      </p>
      {usage !== null && (
        <p className="muted small">{t('settings.storage.usage', { used: formatBytes(usage) })}</p>
      )}
      {status === 'denied' && (
        <button
          type="button"
          className="btn btn-small"
          onClick={() => void requestPersistence().then(setStatus)}
        >
          {t('settings.storage.request')}
        </button>
      )}
    </div>
  );
}

export function SettingsScreen() {
  const t = useT();
  const s = useSettings();
  const update = useApp((st) => st.updateSettings);
  const deleteEverything = useApp((st) => st.deleteEverything);
  const toast = useApp((st) => st.toast);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const days = weekdayNames(s.language);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    void update({ [key]: value });

  const setCompany = async (patch: Partial<Settings['company']>) => {
    const next = { ...s.company, ...patch };
    await update({ company: next });
    if (syncConfigured(s.company, SYNC_URL) || !syncConfigured(next, SYNC_URL)) return;
    // Just set up: ask for location permission now, not in the middle of the first punch.
    const result = await currentLocation();
    if ('error' in result && result.error !== 'timeout') toast(t('sync.locationDenied'), 'error');
  };

  return (
    <div className="screen settings">
      <Section title={t('settings.company')} id="s-company">
        <p className="muted small">{t('settings.company.help')}</p>
        {SYNC_URL === '' && <p className="warn small">{t('settings.company.noServer')}</p>}
        <TextField
          label={t('settings.company.name')}
          value={s.company.employeeName}
          autoComplete="name"
          onChange={(v) => void setCompany({ employeeName: v })}
        />
        <TextField
          label={t('settings.company.key')}
          type="password"
          value={s.company.accessKey}
          onChange={(v) => void setCompany({ accessKey: v })}
        />
        <p className="muted small">{t('settings.company.location')}</p>
      </Section>

      <Section title={t('settings.display')} id="s-display">
        <SelectField
          label={t('settings.language')}
          value={s.language}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
          onChange={(v) => set('language', v)}
        />
        <SelectField
          label={t('settings.theme')}
          value={s.theme}
          options={(['system', 'light', 'dark'] as const).map((v) => ({
            value: v,
            label: t(`settings.theme.${v}`),
          }))}
          onChange={(v) => set('theme', v)}
        />
        <SelectField
          label={t('settings.timeFormat')}
          value={s.timeFormat}
          options={(['24h', '12h'] as const).map((v) => ({
            value: v,
            label: t(`settings.timeFormat.${v}`),
          }))}
          onChange={(v) => set('timeFormat', v)}
        />
        <SelectField
          label={t('settings.durationStyle')}
          value={s.durationStyle}
          options={(['hm', 'decimal'] as const).map((v) => ({
            value: v,
            label: t(`settings.durationStyle.${v}`),
          }))}
          onChange={(v) => set('durationStyle', v)}
        />
        <SelectField
          label={t('settings.weekStart')}
          value={s.weekStartsOn}
          options={[1, 0, 6].map((d) => ({ value: d as WeekDay, label: days[d] ?? '' }))}
          onChange={(v) => set('weekStartsOn', v)}
        />
      </Section>

      <Section title={t('settings.work')} id="s-work">
        <Switch
          label={t('settings.autoBreak')}
          help={t('settings.autoBreakHelp')}
          checked={s.autoBreak.enabled}
          onChange={(v) => set('autoBreak', { ...s.autoBreak, enabled: v })}
        />
        {s.autoBreak.enabled && (
          <div className="indent">
            <NumberField
              label={t('settings.autoBreakMinutes')}
              value={s.autoBreak.minutes}
              min={0}
              max={600}
              onChange={(v) => set('autoBreak', { ...s.autoBreak, minutes: v })}
            />
            <NumberField
              label={t('settings.autoBreakAfter')}
              value={s.autoBreak.afterHours}
              min={0}
              max={24}
              step={0.5}
              onChange={(v) => set('autoBreak', { ...s.autoBreak, afterHours: v })}
            />
          </div>
        )}
      </Section>

      <Section title={t('settings.exportDefaults')} id="s-export">
        <SelectField
          label={t('settings.defaultFormat')}
          value={s.exportFormat}
          options={EXPORT_FORMATS.map((f) => ({ value: f, label: t(`export.format.${f}`) }))}
          onChange={(v) => set('exportFormat', v)}
        />
        <SelectField
          label={t('settings.defaultRange')}
          value={s.exportRange}
          options={RANGE_PRESETS.filter((r) => r !== 'custom').map((r) => ({
            value: r,
            label: t(`range.${r}`),
          }))}
          onChange={(v) => set('exportRange', v)}
        />
      </Section>

      <Section title={t('settings.data')} id="s-data">
        <StorageStatus />
        <NumberField
          label={t('settings.backupReminderDays')}
          value={s.backupReminderDays}
          min={0}
          max={365}
          onChange={(v) => set('backupReminderDays', Math.round(v))}
        />
        <button type="button" className="btn" onClick={() => navigate('backup')}>
          {t('nav.backup')}
        </button>
        <hr />
        <p className="muted small">{t('settings.deleteAllHelp')}</p>
        <button type="button" className="btn btn-danger" onClick={() => setConfirmStep(1)}>
          {t('settings.deleteAll')}
        </button>
      </Section>

      <ConfirmDialog
        open={confirmStep === 1}
        title={t('settings.deleteAll')}
        message={t('settings.deleteAllConfirm1')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => setConfirmStep(2)}
        onCancel={() => setConfirmStep(0)}
      />
      <ConfirmDialog
        open={confirmStep === 2}
        title={t('settings.deleteAll')}
        message={t('settings.deleteAllConfirm1')}
        requireWord={t('settings.deleteAllWord')}
        requireWordPrompt={t('settings.deleteAllConfirm2')}
        confirmLabel={t('settings.deleteAll')}
        danger
        onConfirm={() => {
          setConfirmStep(0);
          void deleteEverything().then(() => toast(t('settings.deleted')));
        }}
        onCancel={() => setConfirmStep(0)}
      />
    </div>
  );
}
