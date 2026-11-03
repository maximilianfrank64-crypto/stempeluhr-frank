import { useRef, useState } from 'react';
import { createBackup, parseBackup, type BackupFile } from '../../core/backup';
import { formatDateLong, formatTime } from '../../core/format';
import { dayKey } from '../../core/periods';
import { useApp } from '../../store/appStore';
import { ConfirmDialog, Section } from '../../ui/components';
import { useSettings, useT } from '../../ui/hooks';
import { Icon } from '../../ui/icons';
import { canShareFiles, deliverFile } from '../export/share';

export function BackupScreen() {
  const t = useT();
  const settings = useSettings();
  const shifts = useApp((s) => s.shifts);
  const dayNotes = useApp((s) => s.dayNotes);
  const meta = useApp((s) => s.meta);
  const updateMeta = useApp((s) => s.updateMeta);
  const restore = useApp((s) => s.restore);
  const toast = useApp((s) => s.toast);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [pending, setPending] = useState<{ backup: BackupFile; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const makeBackup = async () => {
    const now = Date.now();
    const backup = createBackup(shifts, settings, now, Object.values(dayNotes));
    const res = await deliverFile(
      JSON.stringify(backup, null, 2),
      `punch-clock-backup_${dayKey(now)}.json`,
      'application/json',
      canShareFiles() ? 'share' : 'download',
    );
    if (res !== 'cancelled') await updateMeta({ lastBackupAt: now });
  };

  const doRestore = async (p: { backup: BackupFile; skipped: number }) => {
    setPending(null);
    try {
      const n = await restore(p.backup, mode);
      toast(t('backup.restored', { n }));
      if (p.skipped) toast(t('backup.skipped', { n: p.skipped }));
    } catch (e) {
      setError(t('common.error', { message: e instanceof Error ? e.message : String(e) }));
    }
  };

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    const res = parseBackup(await file.text(), Date.now());
    if (fileInput.current) fileInput.current.value = '';
    if (!res.ok) {
      setError(t(`backup.err.${res.error}`));
      return;
    }
    if (mode === 'replace') setPending(res);
    else await doRestore(res);
  };

  return (
    <div className="screen backup">
      <Section>
        <div className="callout">
          <Icon name="shield" className="callout-icon" />
          <div>
            <p>{t('backup.why')}</p>
            <p className="muted small">{t('backup.howto')}</p>
          </div>
        </div>
      </Section>

      <Section title={t('backup.create')} id="b-create">
        <p className="muted">{t('backup.entries', { n: shifts.length })}</p>
        <p>
          {meta.lastBackupAt
            ? t('backup.last', {
                date: `${formatDateLong(meta.lastBackupAt, settings.language)} ${formatTime(meta.lastBackupAt, settings.timeFormat)}`,
              })
            : t('backup.never')}
        </p>
        <button
          type="button"
          className="btn btn-primary btn-large"
          onClick={() => void makeBackup()}
        >
          <Icon name="share" /> {t('backup.create')}
        </button>
      </Section>

      <Section title={t('backup.restore')} id="b-restore">
        <fieldset className="radio-list">
          <legend>{t('backup.restoreMode')}</legend>
          {(['merge', 'replace'] as const).map((m) => (
            <label key={m} className={`radio ${mode === m ? 'on' : ''}`}>
              <input
                type="radio"
                name="restore-mode"
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              <span>{t(`backup.mode.${m}`)}</span>
            </label>
          ))}
        </fieldset>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          id="restore-file"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <label htmlFor="restore-file" className="btn btn-large">
          <Icon name="backup" /> {t('backup.restore')}
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Section>

      <ConfirmDialog
        open={pending !== null}
        title={t('backup.restore')}
        message={t('backup.confirmReplace', { n: pending?.backup.shifts.length ?? 0 })}
        confirmLabel={t('backup.mode.replace')}
        danger
        onConfirm={() => pending && void doRestore(pending)}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
