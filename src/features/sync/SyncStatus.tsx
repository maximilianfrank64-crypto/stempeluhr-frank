import { SYNC_URL } from '../../config';
import { formatTime } from '../../core/format';
import { syncConfigured } from '../../core/sync';
import { useApp } from '../../store/appStore';
import { useSettings, useT } from '../../ui/hooks';
import { href } from '../../ui/router';

/** One line on the home screen: does the office have everything? */
export function SyncStatus() {
  const t = useT();
  const settings = useSettings();
  const sync = useApp((s) => s.sync);
  const lastSyncAt = useApp((s) => s.meta.lastSyncAt);
  const flush = useApp((s) => s.flushOutbox);

  if (!syncConfigured(settings.company, SYNC_URL)) {
    return (
      <p className="sync-status muted small">
        {t('sync.off')} <a href={href('settings')}>{t('sync.setUp')}</a>
      </p>
    );
  }
  if (sync.pending === 0) {
    return (
      <p className="sync-status ok small">
        {t('sync.ok')}
        {lastSyncAt !== null &&
          ` · ${t('sync.lastSent', { time: formatTime(lastSyncAt, settings.timeFormat) })}`}
      </p>
    );
  }
  const reason =
    sync.lastError === 'offline'
      ? t('sync.err.offline')
      : sync.lastError === 'auth'
        ? t('sync.err.auth')
        : sync.lastError;
  return (
    <p className="sync-status warn small" role="status">
      {t('sync.pending', { n: sync.pending })}
      {reason && ` · ${reason}`}{' '}
      <button type="button" className="link-btn small" onClick={() => void flush()}>
        {t('sync.sendNow')}
      </button>
    </p>
  );
}
