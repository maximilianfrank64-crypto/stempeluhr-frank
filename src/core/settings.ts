import type {
  DurationStyle,
  ExportFormat,
  Language,
  RangePreset,
  Settings,
  Theme,
  TimeFormat,
  WeekDay,
} from './types';

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  'csv',
  'xlsx',
  'pdf',
  'json',
  'txt',
  'html',
];
export const RANGE_PRESETS: readonly RangePreset[] = [
  'today',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'all',
  'custom',
];

export function defaultSettings(language: Language = 'en'): Settings {
  return {
    timeFormat: language === 'de' ? '24h' : '12h',
    weekStartsOn: language === 'de' ? 1 : 0,
    language,
    // White plaster look by default, also when the phone is in dark mode.
    theme: 'light',
    durationStyle: 'hm',
    autoBreak: { enabled: false, minutes: 30, afterHours: 6 },
    company: { employeeName: '', accessKey: '' },
    exportFormat: 'csv',
    exportRange: 'thisMonth',
    backupReminderDays: 30,
  };
}

/** Guess the UI language from the browser, falling back to English. */
export function detectLanguage(navigatorLanguages: readonly string[] | undefined): Language {
  for (const lang of navigatorLanguages ?? []) {
    const base = lang.toLowerCase().split('-')[0];
    if (base === 'de') return 'de';
    if (base === 'en') return 'en';
  }
  return 'en';
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/**
 * Merge stored/imported settings onto the defaults, dropping anything invalid.
 * Keeps old saved data working when new settings are added in later versions.
 */
export function sanitizeSettings(input: unknown, base: Settings = defaultSettings()): Settings {
  if (!isObj(input)) return base;
  const ab = isObj(input.autoBreak) ? input.autoBreak : {};
  const co = isObj(input.company) ? input.company : {};
  const text = (v: unknown, fallback: string, max: number) =>
    typeof v === 'string' ? v.trim().slice(0, max) : fallback;
  const weekDays: readonly WeekDay[] = [0, 1, 2, 3, 4, 5, 6];

  return {
    timeFormat: pick<TimeFormat>(input.timeFormat, ['24h', '12h'], base.timeFormat),
    weekStartsOn: weekDays.includes(input.weekStartsOn as WeekDay)
      ? (input.weekStartsOn as WeekDay)
      : base.weekStartsOn,
    language: pick<Language>(input.language, ['en', 'de'], base.language),
    theme: pick<Theme>(input.theme, ['system', 'light', 'dark'], base.theme),
    durationStyle: pick<DurationStyle>(input.durationStyle, ['hm', 'decimal'], base.durationStyle),
    autoBreak: {
      enabled: bool(ab.enabled, base.autoBreak.enabled),
      minutes: num(ab.minutes, base.autoBreak.minutes, 0, 600),
      afterHours: num(ab.afterHours, base.autoBreak.afterHours, 0, 24),
    },
    company: {
      employeeName: text(co.employeeName, base.company.employeeName, 80),
      accessKey: text(co.accessKey, base.company.accessKey, 200),
    },
    exportFormat: pick(input.exportFormat, EXPORT_FORMATS, base.exportFormat),
    exportRange: pick(input.exportRange, RANGE_PRESETS, base.exportRange),
    backupReminderDays: Math.round(num(input.backupReminderDays, base.backupReminderDays, 0, 365)),
  };
}
