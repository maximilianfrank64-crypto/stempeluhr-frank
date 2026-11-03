import { version } from '../../../package.json';
import { Section } from '../../ui/components';
import { useT } from '../../ui/hooks';
import { Icon } from '../../ui/icons';
import { href } from '../../ui/router';

export function AboutScreen() {
  const t = useT();
  return (
    <div className="screen about">
      <Section>
        <div className="about-head">
          <img src={`${import.meta.env.BASE_URL}icons/pwa-192.png`} alt="" width="64" height="64" />
          <div>
            <h2>{t('app.name')}</h2>
            <p className="muted small">{t('about.version', { v: version })}</p>
          </div>
        </div>
        <p>{t('about.text')}</p>
      </Section>
      <Section title={t('about.privacyTitle')} id="a-privacy">
        <div className="callout">
          <Icon name="shield" className="callout-icon" />
          <p>{t('about.privacy')}</p>
        </div>
      </Section>
      <Section title={t('about.storageTitle')} id="a-storage">
        <p>{t('about.storage')}</p>
        <p className="muted small">{t('backup.why')}</p>
        <a className="btn" href={href('backup')}>
          <Icon name="backup" /> {t('nav.backup')}
        </a>
      </Section>
      <Section title={t('about.installTitle')} id="a-install">
        <p>{t('about.install')}</p>
      </Section>
    </div>
  );
}
