import { useEffect, useRef, useState, type JSX } from 'react';
import { backupDue } from './core/backup';
import { AboutScreen } from './features/about/AboutScreen';
import { BackupScreen } from './features/backup/BackupScreen';
import { ExportScreen } from './features/export/ExportScreen';
import { HistoryScreen } from './features/history/HistoryScreen';
import { HomeScreen } from './features/punch/HomeScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import type { MessageKey } from './i18n';
import { useApp } from './store/appStore';
import { Toasts } from './ui/components';
import { useNow, useT } from './ui/hooks';
import { Icon, type IconName } from './ui/icons';
import { usePwa } from './ui/pwa';
import { href, useRoute, type Route } from './ui/router';

const NAV: { route: Route; icon: IconName; label: MessageKey }[] = [
  { route: 'home', icon: 'home', label: 'nav.home' },
  { route: 'history', icon: 'history', label: 'nav.history' },
  { route: 'export', icon: 'export', label: 'nav.export' },
  { route: 'settings', icon: 'settings', label: 'nav.settings' },
  { route: 'backup', icon: 'backup', label: 'nav.backup' },
  { route: 'about', icon: 'about', label: 'nav.about' },
];

const SCREENS: Record<Route, () => JSX.Element> = {
  home: HomeScreen,
  history: HistoryScreen,
  export: ExportScreen,
  settings: SettingsScreen,
  backup: BackupScreen,
  about: AboutScreen,
};

function useDocumentSettings() {
  const theme = useApp((s) => s.settings.theme);
  const lang = useApp((s) => s.settings.language);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    root.lang = lang;
  }, [theme, lang]);
}

function Banners() {
  const t = useT();
  const { needRefresh, update, dismiss } = usePwa();
  const shifts = useApp((s) => s.shifts);
  const meta = useApp((s) => s.meta);
  const interval = useApp((s) => s.settings.backupReminderDays);
  const updateMeta = useApp((s) => s.updateMeta);
  const now = useNow(60 * 60 * 1000);
  const route = useRoute();

  const due =
    route !== 'backup' &&
    backupDue({
      now,
      intervalDays: interval,
      hasData: shifts.length > 0,
      lastBackupAt: meta.lastBackupAt,
      dismissedAt: meta.backupReminderDismissedAt,
      firstDataAt: shifts[0]?.createdAt ?? null,
    });

  return (
    <>
      {needRefresh && (
        <div className="banner" role="status">
          <span>{t('update.available')}</span>
          <button type="button" className="btn btn-small btn-primary" onClick={update}>
            {t('update.reload')}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={dismiss}
            aria-label={t('common.close')}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {due && (
        <div className="banner banner-warn" role="status">
          <span>{t('backup.reminder')}</span>
          <a className="btn btn-small btn-primary" href={href('backup')}>
            {t('backup.reminderAction')}
          </a>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void updateMeta({ backupReminderDismissedAt: Date.now() })}
          >
            {t('common.later')}
          </button>
        </div>
      )}
    </>
  );
}

export function App() {
  const t = useT();
  const route = useRoute();
  const ready = useApp((s) => s.ready);
  const loadError = useApp((s) => s.loadError);
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useDocumentSettings();

  // Close the drawer and move focus to the content on navigation.
  useEffect(() => {
    setMenuOpen(false);
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [route]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const Screen = SCREENS[route];
  const current = NAV.find((n) => n.route === route);

  return (
    <div className={`app ${menuOpen ? 'menu-open' : ''}`}>
      <header className="topbar">
        <button
          type="button"
          className="icon-btn menu-btn"
          aria-label={t('nav.menu')}
          aria-expanded={menuOpen}
          aria-controls="drawer"
          onClick={() => setMenuOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <h1 className="topbar-title">
          {route === 'home' ? t('app.name') : t(current?.label ?? 'nav.home')}
        </h1>
        <span className="topbar-spacer" />
      </header>

      <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      <nav id="drawer" className="drawer" aria-label={t('nav.menu')}>
        <div className="drawer-head">
          <span className="drawer-brand">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
            {t('app.name')}
          </span>
          <button
            type="button"
            className="icon-btn drawer-close"
            aria-label={t('nav.close')}
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <ul>
          {NAV.map((n) => (
            <li key={n.route}>
              <a
                href={href(n.route)}
                className={n.route === route ? 'active' : undefined}
                aria-current={n.route === route ? 'page' : undefined}
                onClick={(e) => {
                  if (n.route === route) {
                    e.preventDefault();
                    setMenuOpen(false);
                  }
                }}
              >
                <Icon name={n.icon} />
                <span>{t(n.label)}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="main" ref={mainRef} tabIndex={-1}>
        <Banners />
        {loadError && (
          <div className="banner banner-error" role="alert">
            {t('common.error', { message: loadError })}
          </div>
        )}
        {ready ? <Screen /> : <p className="muted center">{t('common.loading')}</p>}
      </main>
      <Toasts />
    </div>
  );
}
