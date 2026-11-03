/**
 * Domain types. All timestamps are epoch milliseconds (UTC instants).
 * They are only converted to local wall-clock time for rounding and display.
 */

export type PunchEventType = 'in' | 'out' | 'breakStart' | 'breakEnd';

export type RoundingMode = 'off' | 'nearest' | 'up' | 'down';

export interface RoundingRule {
  mode: RoundingMode;
  /** Interval in minutes (1..1440). */
  interval: number;
}

export type RoundingRules = Record<PunchEventType, RoundingRule>;

/** A punch moment. `raw` is what the clock said, `rounded` is after applying the rounding rule. */
export interface Stamp {
  raw: number;
  rounded: number;
}

export interface Break {
  id: string;
  start: Stamp;
  /** null while the break is running. */
  end: Stamp | null;
}

/** Where the phone was at a punch, or why that is unknown. */
export type GeoResult =
  | { lat: number; lon: number; accuracyM: number; at: number }
  | { error: 'denied' | 'unavailable' | 'timeout' | 'unsupported' };

export interface Shift {
  id: string;
  start: Stamp;
  /** null while the shift is running (the "active session"). */
  end: Stamp | null;
  breaks: Break[];
  note: string;
  source: 'punch' | 'manual';
  createdAt: number;
  updatedAt: number;
  /** Location at punch in / punch out; absent when not recorded (manual entry, not set up). */
  startLocation?: GeoResult;
  endLocation?: GeoResult;
  /** Ended by the app at 23:59 because nobody punched out; the office should ask. */
  autoClosed?: boolean;
}

export type PunchStatus = 'off' | 'working' | 'break';

export type TimeFormat = '24h' | '12h';
export type Language = 'en' | 'de';
export type Theme = 'system' | 'light' | 'dark';
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type ExportFormat = 'csv' | 'xlsx' | 'pdf' | 'json' | 'txt' | 'html';
export type RangePreset =
  'today' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'all' | 'custom';
export type DurationStyle = 'hm' | 'decimal';

export interface AutoBreakSettings {
  enabled: boolean;
  /** Minimum total break in minutes ... */
  minutes: number;
  /** ... once the shift is longer than this many hours. */
  afterHours: number;
}

/**
 * Sending hours to the company. With an empty name or key nothing is sent and the
 * app works on the device only. Once set up, every punch in and out carries the location.
 */
export interface CompanySettings {
  employeeName: string;
  /** Company key handed out by the office, sent as the webhook's auth header. */
  accessKey: string;
}

/** Times are always recorded exactly; the office decides about rounding. */
export interface Settings {
  timeFormat: TimeFormat;
  weekStartsOn: WeekDay;
  language: Language;
  theme: Theme;
  durationStyle: DurationStyle;
  autoBreak: AutoBreakSettings;
  company: CompanySettings;
  exportFormat: ExportFormat;
  exportRange: RangePreset;
  /** Days between backup reminders; 0 disables the reminder. */
  backupReminderDays: number;
}

export interface DateRange {
  /** Inclusive local day keys, yyyy-MM-dd. */
  from: string;
  to: string;
}

/**
 * Extra work billed by the hour (Rapportarbeiten). Asked on every working day,
 * so "none" is an explicit answer, not a forgotten one.
 */
export type Rapport = { done: false } | { done: true; hours: number; text: string };

/** Note for a whole calendar day: where the work was done, plus the Rapport answer. */
export interface DayNote {
  /** Local day key, yyyy-MM-dd. */
  date: string;
  text: string;
  /** Absent until answered (e.g. days recorded before this existed). */
  rapport?: Rapport;
  updatedAt: number;
}
