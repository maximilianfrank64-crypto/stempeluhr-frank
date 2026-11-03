import type { ExportLabels } from '../core/export/context';
import type { Language } from '../core/types';
import { de } from './de';
import { en, type MessageKey, type Messages } from './en';

export type { MessageKey } from './en';

/** Add a language: create a dictionary typed as `Messages` and register it here. */
const dictionaries: Record<Language, Messages> = { en, de };

export const LANGUAGES: { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
];

export type Params = Record<string, string | number>;

export function translate(lang: Language, key: MessageKey, params?: Params): string {
  const template = dictionaries[lang][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  );
}

export type TFunction = (key: MessageKey, params?: Params) => string;

export function makeT(lang: Language): TFunction {
  return (key, params) => translate(lang, key, params);
}

export function exportLabels(lang: Language): ExportLabels {
  const t = makeT(lang);
  const keys: (keyof ExportLabels)[] = [
    'title',
    'period',
    'generated',
    'date',
    'weekday',
    'start',
    'end',
    'breaks',
    'worked',
    'hoursDecimal',
    'dayTotal',
    'note',
    'dayNote',
    'week',
    'month',
    'total',
    'shifts',
    'weeklyTotals',
    'monthlyTotals',
    'entries',
    'running',
    'rawTimesNote',
    'roundedTimesNote',
    'autoBreakNote',
    'nextDay',
    'noData',
  ];
  return Object.fromEntries(
    keys.map((k) => [k, t(`export.labels.${k}` as MessageKey)]),
  ) as unknown as ExportLabels;
}

/** Localized weekday names, index 0 = Sunday. */
export function weekdayNames(lang: Language, style: 'long' | 'short' = 'long'): string[] {
  const fmt = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', { weekday: style });
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + i)));
}
