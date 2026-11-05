// n8n Code node "Bericht bauen" (Mode: Run Once for All Items), JavaScript.
// Input: all rows of the Data Table "stempel". The workflow runs every day at 23:58
// and 23:59 (Berlin). At 23:58 it builds the month list on the last day of a month,
// at 23:59 the week list on a Friday (Saturday to Friday) and the "Nachtrag" on a Sunday;
// otherwise no output, and the workflow stops. One file per run, so a Friday that ends a
// month gives two files.
// Late records: a phone without network sends its punches later. The Friday list therefore
// also contains shifts of EARLIER weeks that arrived since the Sunday run ("nachgereicht").
// The Sunday "Nachtrag" contains everything that arrived or changed since Friday 23:59 and is
// only sent when there is something (no empty mails).
// Output: one item per Excel row for "Convert to File" (XLSX). The file name goes to
// $execution.customData "datei" for the mail attachment.
// Times are exact clock times; rounding, targets and pay are decided in the office.
//
// Location check ("Ortspruefung"): the app only records GPS and the address text. Here the
// address is looked up (OpenStreetMap Nominatim) and compared with the GPS of the punches.
// Checked ALWAYS for: punch in before 07:30, punch out after 17:00, more than 9 hours.
// Otherwise only a random-looking but stable sample (about every 5th shift).
// Suspicious = GPS is neither near the address nor near any fixed place.

// ---- Einstellungen (hier aendern) -----------------------------------------------------
const PRUEF = {
  radiusM: 250, // Standard-Radius um Adresse / festen Ort (Meter)
  genauigkeitMaxM: 150, // so viel GPS-Ungenauigkeit wird zum Radius addiert (hoechstens)
  stichprobeJede: 5, // Stichprobe: etwa jede n-te Schicht (0 = keine Stichproben)
  fruehVor: '07:30', // Einstempeln davor: immer pruefen
  spaetNach: '17:00', // Ausstempeln danach: immer pruefen
  langStunden: 9, // mehr Stunden als das: immer pruefen
  pauseGeocodeMs: 1100, // Nominatim erlaubt hoechstens 1 Anfrage pro Sekunde
  fehlendWochen: 8, // "Keine Stempel": wer in den letzten n Wochen gestempelt hat, diese aber nicht
};
// Namen, die NICHT als "keine Stempel" gemeldet werden (so geschrieben wie in der App),
// z. B. wer nur gelegentlich mitstempelt.
const NICHT_MELDEN = ['Maximilian Frank'];
// Feste Orte. Namen wie in der App (Schnellauswahl). Adresse eintragen; die Koordinaten
// werden daraus einmal bestimmt und gemerkt. Wer lat/lon schon kennt, traegt sie ein.
// Wichtig: nur die tatsaechlich angefahrenen Filialen eintragen.
const FESTE_ORTE = [
  { name: 'Lagerplatz', adresse: '', lat: null, lon: null, radiusM: 250 },
  { name: 'Wölpert', adresse: '', lat: null, lon: null, radiusM: 250 },
  { name: 'Fendal', adresse: '', lat: null, lon: null, radiusM: 250 },
  { name: 'Kemmler', adresse: '', lat: null, lon: null, radiusM: 250 },
];
// ----------------------------------------------------------------------------------------

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

/** Sortable Berlin time of an instant: "2026-11-06T23:59:00". Used to compare arrival times. */
function berlinKey(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const g = (t) => parts.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}`;
}

/**
 * The period this run reports on, or null. Month run: last day. Week run: Friday.
 * Sunday run ("Nachtrag"): what arrived since Friday 23:59.
 * `spaetSeit`: on Fridays, shifts of earlier weeks that arrived after this moment are added.
 * `seit`: for the Nachtrag, everything that arrived after this moment.
 */
function duePeriod(today, monthRun) {
  if (monthRun) {
    return addDays(today, 1).slice(8) === '01'
      ? { name: 'Monat', from: `${today.slice(0, 8)}01`, to: today }
      : null;
  }
  const wd = weekday(today);
  if (wd === 5) {
    return {
      name: 'Woche',
      from: addDays(today, -6),
      to: today,
      spaetSeit: `${addDays(today, -5)}T23:59:00`, // after last Sunday's run
    };
  }
  if (wd === 0) {
    return {
      name: 'Nachtrag',
      from: addDays(today, -2),
      to: today,
      nachtrag: true,
      seit: `${addDays(today, -2)}T23:59:00`, // after Friday's run
    };
  }
  return null;
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

// ---- Ortspruefung ---------------------------------------------------------------------
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replaceAll('ö', 'oe')
    .replaceAll('ä', 'ae')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const berlinMinuteOfDay = (iso) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t) => Number(parts.find((x) => x.type === t).value);
  return get('hour') * 60 + get('minute');
};
/** Stable pseudo-random number from text, so a shift is always (not) in the sample. */
function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0;
  return h;
}
function distanceM(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}
const hasCoords = (loc) => loc && typeof loc.lat === 'number' && typeof loc.lon === 'number';
const km = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

/** Why this shift has to be checked, or '' when it is not due (and not in the sample). */
function pruefGrund(s) {
  if (s.source === 'manual' || s.end === null || s.autoClosed) return '';
  if (berlinMinuteOfDay(s.start) < toMinutes(PRUEF.fruehVor)) return 'früh eingestempelt';
  if (berlinMinuteOfDay(s.end) > toMinutes(PRUEF.spaetNach)) return 'spät ausgestempelt';
  if (s.workedHours > PRUEF.langStunden) return `über ${PRUEF.langStunden} Stunden`;
  if (PRUEF.stichprobeJede > 0 && hash(String(s.id)) % PRUEF.stichprobeJede === 0) {
    return 'Stichprobe';
  }
  return '';
}

/** Looks up an address; remembered in the workflow's static data, so each is looked up once. */
async function geocode(helper, address, memo, cache) {
  const key = norm(address);
  if (!key) return null;
  if (cache[key]) return cache[key];
  if (key in memo) return memo[key];
  let result = null;
  // With several tenants the name is added behind the address ("Rohrer Straße 85, Stuttgart,
  // Müller"). If that is not found, try again without the trailing parts.
  const versuche = [address];
  const teile = address.split(',').map((x) => x.trim()).filter(Boolean);
  for (let n = teile.length - 1; n >= 2; n--) versuche.push(teile.slice(0, n).join(', '));
  for (const q of versuche) {
    try {
      await new Promise((r) => setTimeout(r, PRUEF.pauseGeocodeMs));
      const res = await helper.httpRequest({
        method: 'GET',
        url: 'https://nominatim.openstreetmap.org/search',
        qs: { format: 'json', limit: 1, countrycodes: 'de', q },
        headers: { 'User-Agent': 'stempeluhr-frank-n8n' },
        json: true,
      });
      const hit = Array.isArray(res) ? res[0] : null;
      if (hit) {
        result = { lat: Number(hit.lat), lon: Number(hit.lon) };
        break;
      }
    } catch (e) {
      result = null;
    }
  }
  memo[key] = result;
  if (result) cache[key] = result;
  return result;
}

/** Coordinates of every fixed place (from lat/lon or by looking up its address). */
async function festeOrteAufloesen(helper, memo, cache) {
  const out = [];
  for (const o of FESTE_ORTE) {
    let pos = typeof o.lat === 'number' && typeof o.lon === 'number' ? o : null;
    if (!pos && o.adresse) pos = await geocode(helper, o.adresse, memo, cache);
    out.push({ name: o.name, radiusM: o.radiusM || PRUEF.radiusM, pos });
  }
  return out;
}

/**
 * Checks the punch locations of one shift. Returns { status, detail }:
 * status "OK", "AUFFÄLLIG" or "nicht möglich"; detail is a sentence for the Hinweis column.
 */
function pruefen(s, ziel, orte) {
  const stellen = [
    ['Ein', s.startLocation],
    ['Aus', s.endLocation],
  ];
  const probleme = [];
  const infos = [];
  let geprueft = 0;
  for (const [label, loc] of stellen) {
    if (!hasCoords(loc)) continue;
    geprueft++;
    const slack = Math.min(Number(loc.accuracyM) || 0, PRUEF.genauigkeitMaxM);
    // The job site comes first; fixed places (Lager, Großhändler) are just as fine.
    const kandidaten = [];
    if (ziel && ziel.pos) {
      kandidaten.push({ ...ziel, baustelle: true, radiusM: ziel.radiusM || PRUEF.radiusM });
    }
    for (const o of orte) if (o.pos) kandidaten.push(o);
    const treffer = kandidaten.find((k) => distanceM(loc, k.pos) <= k.radiusM + slack);
    if (treffer && !treffer.baustelle) infos.push(`${label} bei ${treffer.name}`);
    if (!treffer) {
      const naechster = ziel && ziel.pos ? distanceM(loc, ziel.pos) : null;
      probleme.push(
        naechster === null
          ? `${label}: nicht an einem festen Ort`
          : `${label}: ${km(naechster)} von der Adresse entfernt`,
      );
    }
  }
  if (geprueft === 0) return { status: 'nicht möglich', detail: 'Ortsprüfung ohne GPS nicht möglich' };
  if (probleme.length) return { status: 'AUFFÄLLIG', detail: probleme.join(', ') };
  return { status: 'OK', detail: '', info: infos.join(', ') };
}

async function buildReport(rows, p, helper, cache) {
  const shifts = [];
  const days = new Map(); // deviceId|date -> { text, rapport }
  for (const r of rows) {
    // An empty table still yields one empty item (alwaysOutputData on the table node).
    if (!r || typeof r.data !== 'string') continue;
    const item = JSON.parse(r.data);
    if (r.kind === 'shift') {
      shifts.push({ ...item, employee: r.employee, deviceId: r.deviceId, receivedAt: r.receivedAt });
    }
    // (older notes have no "address" field: they simply count as "no address")
    if (r.kind === 'dayNote') days.set(`${r.deviceId}|${item.date}`, item);
  }

  const out = [];
  {
    const arrivedAfter = (s, key) => !!s.receivedAt && berlinKey(s.receivedAt) > key;
    // Shifts of earlier weeks that only arrived now (phone had no network on Friday).
    const isLate = (s) => (p.nachtrag ? true : s.date < p.from);
    const inRange = shifts
      .filter((s) =>
        p.nachtrag
          ? arrivedAfter(s, p.seit)
          : (s.date >= p.from && s.date <= p.to) ||
            (!!p.spaetSeit && s.date < p.from && arrivedAfter(s, p.spaetSeit)),
      )
      .sort((a, b) => a.employee.localeCompare(b.employee, 'de') || a.start.localeCompare(b.start));

    // Which shifts get a location check, and the places needed for it (looked up once each).
    const grund = new Map(inRange.map((s) => [s.id, pruefGrund(s)]));
    const memo = {};
    const needsCheck = inRange.some((s) => grund.get(s.id));
    const orte = needsCheck ? await festeOrteAufloesen(helper, memo, cache) : [];
    const zielFuer = new Map(); // address text -> { name, pos, radiusM } | null
    for (const s of inRange) {
      if (!grund.get(s.id)) continue;
      const text = (days.get(`${s.deviceId}|${s.date}`) || {}).address || '';
      if (!text.trim() || zielFuer.has(text)) continue;
      const pos = await geocode(helper, text, memo, cache);
      zielFuer.set(text, { name: text, pos, radiusM: PRUEF.radiusM });
    }

    const totals = new Map(); // employee -> { hours, rapport }
    const rapportShown = new Set(); // Rapport is per day: show it on the day's first row only
    for (const s of inRange) {
      const dayKey = `${s.deviceId}|${s.date}`;
      const day = days.get(dayKey) || { text: '', rapport: null };
      const firstOfDay = !rapportShown.has(dayKey);
      rapportShown.add(dayKey);
      const rapport = firstOfDay ? day.rapport : null;
      const stillOpen = s.end === null;

      // Location check (only when due): see the header of this file.
      let ortStatus = '';
      let ortHinweis = '';
      const warum = grund.get(s.id);
      if (warum) {
        const text = day.address || '';
        const ziel = text.trim() ? zielFuer.get(text) : null;
        if (!text.trim()) {
          ortStatus = 'nicht möglich';
          ortHinweis = `Ortsprüfung nötig (${warum}), aber keine Adresse eingetragen`;
        } else {
          // An address that cannot be found still lets a punch at a fixed place count as fine.
          const r = pruefen(s, ziel && ziel.pos ? ziel : null, orte);
          if (r.status === 'AUFFÄLLIG' && !(ziel && ziel.pos)) {
            ortStatus = 'nicht möglich';
            ortHinweis = `Ortsprüfung nötig (${warum}), aber Adresse nicht gefunden: ${text}`;
          } else {
            ortStatus = r.status;
            ortHinweis = r.status === 'OK' ? '' : r.detail ? `${r.detail} (${warum})` : '';
          }
          if (r.status === 'OK') ortStatus = `OK (${warum}${r.info ? `; ${r.info}` : ''})`;
        }
      }

      const hints = [
        isLate(s)
          ? p.nachtrag
            ? 'nachgereicht oder geändert seit der letzten Liste'
            : `nachgereicht (gehört zum ${germanDate(s.date)}, kam nach der letzten Liste)`
          : '',
        ortHinweis,
        s.autoClosed ? 'automatisch um 23:59 ausgestempelt, bitte nachfragen' : '',
        stillOpen ? 'nicht ausgestempelt, bitte nachfragen' : '',
        s.source === 'manual' ? 'von Hand nachgetragen' : '',
        day.text === '' ? 'Arbeit/Positionen fehlen' : '',
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
          'Arbeit und Positionen': day.text,
          Adresse: day.address || '',
          'Rapport (Std)': rapport && rapport.done ? rapport.hours : rapport ? 0 : '',
          'Rapport Arbeiten': rapport && rapport.done ? rapport.text : '',
          'GPS Ein': mapsLink(s.startLocation),
          'GPS Aus': mapsLink(s.endLocation),
          Ortsprüfung: ortStatus,
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
          'Arbeit und Positionen': `${p.name} ${germanDate(p.from)} bis ${germanDate(p.to)}`,
          Adresse: '',
          'Rapport (Std)': round2(t.rapport),
          'Rapport Arbeiten': '',
          'GPS Ein': '',
          'GPS Aus': '',
          Ortsprüfung: '',
          Hinweis: '',
        },
      });
    }
    // Friday list only: who stamped in the weeks before but not this week. The names come
    // from the records themselves, nobody has to keep a list of employees.
    if (p.name === 'Woche' && out.length > 0) {
      const lookback = addDays(p.from, -7 * PRUEF.fehlendWochen);
      const inWeek = new Set();
      const before = new Set();
      for (const s of shifts) {
        if (s.date >= p.from && s.date <= p.to) inWeek.add(s.employee);
        else if (s.date >= lookback && s.date < p.from) before.add(s.employee);
      }
      const ignore = new Set(NICHT_MELDEN.map((n) => n.toLowerCase()));
      const fehlen = [...before]
        .filter((n) => !inWeek.has(n) && !ignore.has(n.toLowerCase()))
        .sort((a, b) => a.localeCompare(b, 'de'));
      if (fehlen.length) {
        out.push({
          json: {
            Mitarbeiter: 'HINWEIS',
            Datum: 'Keine Stempel diese Woche',
            Tag: '',
            Beginn: '',
            Ende: '',
            'Pause (Min)': '',
            Stunden: '',
            'Arbeit und Positionen': `${fehlen.join(', ')}: in den letzten ${PRUEF.fehlendWochen} Wochen gestempelt, diese Woche nicht (Urlaub, krank, Handy ohne Netz oder vergessen; kommen die Stempel noch, steht es im Nachtrag)`,
            Adresse: '',
            'Rapport (Std)': '',
            'Rapport Arbeiten': '',
            'GPS Ein': '',
            'GPS Aus': '',
            Ortsprüfung: '',
            Hinweis: '',
          },
        });
      }
    }
  }
  return out;
}

const now = Date.now();
const period = duePeriod(berlinDay(now), berlinMinute(now) === 58);
if (!period) return [];
$execution.customData.set('datei', `Stunden_${period.name}_${period.from}_bis_${period.to}.xlsx`);
// Looked-up places are remembered between runs (workflow static data, active workflow only).
const staticData = $getWorkflowStaticData('global');
staticData.orte = staticData.orte || {};
return await buildReport(
  $input.all().map((i) => i.json),
  period,
  this.helpers,
  staticData.orte,
);
