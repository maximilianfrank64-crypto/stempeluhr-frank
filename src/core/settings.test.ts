import { describe, expect, it } from 'vitest';
import { defaultSettings, detectLanguage, sanitizeSettings } from './settings';

describe('settings', () => {
  it('defaults: light theme, nothing sent until set up', () => {
    const s = defaultSettings();
    expect(s.theme).toBe('light');
    expect(s.company).toEqual({ employeeName: '', accessKey: '' });
  });

  it('German defaults use 24h and Monday', () => {
    const s = defaultSettings('de');
    expect(s.timeFormat).toBe('24h');
    expect(s.weekStartsOn).toBe(1);
  });

  it('sanitize keeps valid values and repairs invalid ones', () => {
    const s = sanitizeSettings({
      timeFormat: '24h',
      company: { employeeName: '  Jonas Weber ', accessKey: 42 },
      unknown: true,
    });
    expect(s.timeFormat).toBe('24h');
    expect(s.company).toEqual({ employeeName: 'Jonas Weber', accessKey: '' });
    expect(sanitizeSettings(null)).toEqual(defaultSettings());
  });

  it('drops hourly rate and rounding from settings of the old app', () => {
    const s = sanitizeSettings({
      rate: { enabled: true, hourlyRate: 15, taxPercent: 30 },
      rounding: { in: { mode: 'nearest', interval: 15 } },
      useRawInReports: false,
      targets: { dailyEnabled: true, dailyHours: 8 },
    });
    expect(s).not.toHaveProperty('rate');
    expect(s).not.toHaveProperty('rounding');
    expect(s).not.toHaveProperty('useRawInReports');
    expect(s).not.toHaveProperty('targets');
  });

  it('detects language', () => {
    expect(detectLanguage(['de-AT', 'en'])).toBe('de');
    expect(detectLanguage(['fr-FR', 'en-GB'])).toBe('en');
    expect(detectLanguage(undefined)).toBe('en');
  });
});
