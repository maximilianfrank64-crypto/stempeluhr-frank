// n8n Code node "Woche zusammenfassen" (Run Once for All Items). Input: all rows of the Data Table.
// Builds the readable weekly summary (Saturday to Friday, the same week as the Friday Excel list)
// for the mail body. Output: one item { subject, text }. Times are Berlin time.
// Umlauts in strings are written as \u escapes (the n8n API mangles them otherwise).
const TZ = 'Europe/Berlin';
const NICHT_MELDEN = ['maximilian frank', 'werner frank'];
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const berlinDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, dateStyle: 'short' }).format(ms);
const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();
const de = (day) => day.split('-').reverse().join('.');
const zahl = (x) => (Math.round(x * 100) / 100).toString().replace('.', ',');
// Last finished week: ends on the latest Friday that is before today.
let to = addDays(berlinDay(Date.now()), -1);
while (weekday(to) !== 5) to = addDays(to, -1);
const from = addDays(to, -6);

const shifts = [];
const notes = new Map();
for (const r of $input.all().map((i) => i.json)) {
  if (!r || typeof r.data !== 'string') continue;
  const it = JSON.parse(r.data);
  if (r.kind === 'shift') shifts.push({ ...it, employee: r.employee, deviceId: r.deviceId });
  if (r.kind === 'dayNote') notes.set(`${r.deviceId}|${it.date}`, it);
}
const inWeek = shifts.filter((s) => s.date >= from && s.date <= to);
const per = new Map();
const get = (n) => {
  if (!per.has(n)) per.set(n, { std: 0, tage: new Set(), rapportStd: 0, rapport: [], fotos: 0, offen: [], rapportOffen: [] });
  return per.get(n);
};
const seenDay = new Set();
for (const s of inWeek.sort((a, b) => a.employee.localeCompare(b.employee, 'de') || a.start.localeCompare(b.start))) {
  const p = get(s.employee);
  const tag = `${WD[weekday(s.date)]} ${de(s.date).slice(0, 5)}`;
  p.tage.add(s.date);
  if (s.end === null) p.offen.push(`${tag}: nicht ausgestempelt`);
  else {
    p.std += s.workedHours;
    if (s.autoClosed) p.offen.push(`${tag}: automatisch um 23:59 ausgestempelt, Zeit prüfen`);
  }
  if (s.source === 'manual') p.offen.push(`${tag}: von Hand nachgetragen`);
  const key = `${s.deviceId}|${s.date}`;
  if (seenDay.has(key)) continue;
  seenDay.add(key);
  const n = notes.get(key);
  if (!n || !n.text) p.offen.push(`${tag}: Arbeit/Positionen fehlen`);
  const r = n && n.rapport;
  if (!r) p.rapportOffen.push(`${tag}${n && n.address ? ' (' + n.address + ')' : ''}`);
  else if (r.done) {
    p.rapportStd += Number(r.hours) || 0;
    const f = Array.isArray(r.photos) ? r.photos.length : 0;
    p.fotos += f;
    p.rapport.push(`${tag}${n.address ? ', ' + n.address : ''}: ${zahl(Number(r.hours) || 0)} Std, ${r.text || 'ohne Text'}${f ? ` (${f} Foto${f > 1 ? 's' : ''})` : ''}`);
  }
}
const names = [...per.keys()].filter((n) => !/^test/i.test(n)).sort((a, b) => a.localeCompare(b, 'de'));
let gesamt = 0;
let gesamtR = 0;
const bloecke = names.map((n) => {
  const p = per.get(n);
  gesamt += p.std;
  gesamtR += p.rapportStd;
  const z = [`${n}: ${zahl(p.std)} Std an ${p.tage.size} Tagen, davon Rapport ${zahl(p.rapportStd)} Std${p.fotos ? `, ${p.fotos} Foto${p.fotos > 1 ? 's' : ''}` : ''}`];
  for (const r of p.rapport) z.push(`   Rapport: ${r}`);
  if (p.rapportOffen.length) z.push(`   Rapport-Frage nicht beantwortet: ${p.rapportOffen.join('; ')}`);
  for (const o of p.offen) z.push(`   Offen: ${o}`);
  return z.join('\n');
});
// Employees who stamped in the 8 weeks before but not this week.
const vorher = new Set(shifts.filter((s) => s.date >= addDays(from, -56) && s.date < from).map((s) => s.employee));
const fehlen = [...vorher].filter((n) => !per.has(n) && !NICHT_MELDEN.includes(n.toLowerCase()) && !/^test/i.test(n)).sort((a, b) => a.localeCompare(b, 'de'));
let text = `Hallo Werner,\n\nhier die Übersicht der Stempeluhr für die Woche ${de(from)} bis ${de(to)} (Samstag bis Freitag).\n\n`;
if (!names.length) text += 'In dieser Woche wurde nichts gestempelt.\n';
else {
  text += `Zusammen: ${zahl(gesamt)} Std, davon Rapport ${zahl(gesamtR)} Std.\n\n` + bloecke.join('\n\n') + '\n';
}
if (fehlen.length) text += `\nKeine Stempel diese Woche (aber in den Wochen davor): ${fehlen.join(', ')}\n`;
text += '\n"Offen" heißt: bitte nachfragen oder prüfen. Die genauen Zeiten stehen in der Excel-Liste vom Freitag.\n\nAutomatisch erstellt von n8n.';
return [{ json: { subject: `Stempeluhr: Wochenübersicht ${de(from)} bis ${de(to)}`, text } }];
