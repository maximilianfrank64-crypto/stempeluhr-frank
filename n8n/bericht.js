// n8n Code node "Bericht bauen" (Mode: Run Once for All Items), JavaScript.
// Input: all rows of the Data Table "stempel". The workflow runs every day at 23:58
// and 23:59 (Berlin). At 23:58 it builds the month list on the last day of a month,
// at 23:59 the week list on a Friday (Saturday to Friday); otherwise no output, and
// the workflow stops. One file per run, so a Friday that ends a month gives two files.
// Output: one item per Excel row for "Convert to File" (XLSX). The file name goes to
// $execution.customData "datei" for the OneDrive upload.
// Times are exact clock times; rounding, targets and pay are decided in the office.

const TZ = 'Europe/Berlin';
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** yyyy-MM-dd of an instant in Berlin time. */
const berlinDay = (ms) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, dateStyle: 'short' }).format(ms);
/** Berlin minute of the hour (58 = month run, 59 = week run). */
const berlinMinute = (ms) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, minute: '2-digit' }).format(ms));
const berlinTime = (iso) =>
  iso
    ? new Intl.DateTimeFormat('de-DE', { timeZone: TZ, timeStyle: 'short' }).format(new Date(iso))
    : '';
function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
const germanDate = (day) => day.split('-').reverse().join('.');
const round2 = (h) => Math.round(h * 100) / 100;

/** The period this run reports on, or null. Month run: last day. Week run: Friday. */
function duePeriod(today, monthRun) {
  if (monthRun) {
    return addDays(today, 1).slice(8) === '01'
      ? { name: 'Monat', from: `${today.slice(0, 8)}01`, to: today }
      : null;
  }
  return weekday(today) === 5 ? { name: 'Woche', from: addDays(today, -6), to: today } : null;
}

const mapsLink = (loc) =>
  loc && typeof loc.lat === 'number' ? `https://www.google.com/maps?q=${loc.lat},${loc.lon}` : '';

function gpsHint(loc, label) {
  if (!loc) return `${label}: kein Standort`;
  if (loc.error === 'denied') return `${label}: Standort abgelehnt`;
  if (loc.error) return `${label}: kein GPS`;
  if (loc.accuracyM > 200) return `${label}: Standort ungenau (${loc.accuracyM} m)`;
  return '';
}

function buildReport(rows, p) {
  const shifts = [];
  const days = new Map(); // deviceId|date -> { text, rapport }
  for (const r of rows) {
    // An empty table still yields one empty item (alwaysOutputData on the table node).
    if (!r || typeof r.data !== 'string') continue;
    const item = JSON.parse(r.data);
    if (r.kind === 'shift') shifts.push({ ...item, employee: r.employee, deviceId: r.deviceId });
    if (r.kind === 'dayNote') days.set(`${r.deviceId}|${item.date}`, item);
  }

  const out = [];
  {
    const inRange = shifts
      .filter((s) => s.date >= p.from && s.date <= p.to)
      .sort((a, b) => a.employee.localeCompare(b.employee, 'de') || a.start.localeCompare(b.start));

    const totals = new Map(); // employee -> { hours, rapport }
    const rapportShown = new Set(); // Rapport is per day: show it on the day's first row only
    for (const s of inRange) {
      const dayKey = `${s.deviceId}|${s.date}`;
      const day = days.get(dayKey) || { text: '', rapport: null };
      const firstOfDay = !rapportShown.has(dayKey);
      rapportShown.add(dayKey);
      const rapport = firstOfDay ? day.rapport : null;
      const stillOpen = s.end === null;

      const hints = [
        s.autoClosed ? 'automatisch um 23:59 ausgestempelt, bitte nachfragen' : '',
        stillOpen ? 'nicht ausgestempelt, bitte nachfragen' : '',
        s.source === 'manual' ? 'von Hand nachgetragen' : '',
        day.text === '' ? 'Baustelle/Arbeiten fehlen' : '',
        firstOfDay && !day.rapport ? 'Rapport-Frage nicht beantwortet' : '',
        s.source === 'manual' ? '' : gpsHint(s.startLocation, 'Ein'),
        s.source === 'manual' || stillOpen || s.autoClosed ? '' : gpsHint(s.endLocation, 'Aus'),
      ].filter(Boolean);

      out.push({
        json: {
          Mitarbeiter: s.employee,
          Datum: germanDate(s.date),
          Tag: WD[weekday(s.date)],
          Beginn: berlinTime(s.start),
          Ende: berlinTime(s.end),
          'Pause (Min)': s.breakMinutes,
          // An open shift has no reliable hours yet: left empty, see Hinweis.
          Stunden: stillOpen ? '' : s.workedHours,
          'Baustelle und Arbeiten': day.text,
          'Rapport (Std)': rapport && rapport.done ? rapport.hours : rapport ? 0 : '',
          'Rapport Arbeiten': rapport && rapport.done ? rapport.text : '',
          'GPS Ein': mapsLink(s.startLocation),
          'GPS Aus': mapsLink(s.endLocation),
          Hinweis: hints.join('; '),
        },
      });

      const t = totals.get(s.employee) || { hours: 0, rapport: 0 };
      if (!stillOpen) t.hours += s.workedHours;
      if (rapport && rapport.done) t.rapport += rapport.hours;
      totals.set(s.employee, t);
    }

    for (const [employee, t] of totals) {
      out.push({
        json: {
          Mitarbeiter: employee,
          Datum: 'SUMME',
          Tag: '',
          Beginn: '',
          Ende: '',
          'Pause (Min)': '',
          Stunden: round2(t.hours),
          'Baustelle und Arbeiten': `${p.name} ${germanDate(p.from)} bis ${germanDate(p.to)}`,
          'Rapport (Std)': round2(t.rapport),
          'Rapport Arbeiten': '',
          'GPS Ein': '',
          'GPS Aus': '',
          Hinweis: '',
        },
      });
    }
  }
  return out;
}

const now = Date.now();
const period = duePeriod(berlinDay(now), berlinMinute(now) === 58);
if (!period) return [];
$execution.customData.set('datei', `Stunden_${period.name}_${period.from}_bis_${period.to}.xlsx`);
return buildReport(
  $input.all().map((i) => i.json),
  period,
);
