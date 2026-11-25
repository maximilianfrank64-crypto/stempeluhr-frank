// n8n Code node "Fotos aufbereiten" (Mode: Run Once for All Items).
// Input: all rows of the Data Table "Stempeluhr Frank".
// Output: one item per Rapport photo that has not been mailed yet (or changed since),
// with the photo as binary "data" and the e-mail text for Werner. Nothing to do = no items.
// "Already mailed" is remembered in marker rows (kind "fotoversand", key "foto:<note key>:<n>",
// data = {"hash": ...}); the report workflow ignores them. A marker is written only after the
// mail went out, so a failed mail is simply tried again on the next run.

const rows = $input.all().map((i) => i.json);

// Escapes instead of literal umlauts: the code travels through APIs that may mangle UTF-8.
const tausch = {
  'ä': 'ae',
  'ö': 'oe',
  'ü': 'ue',
  'Ä': 'Ae',
  'Ö': 'Oe',
  'Ü': 'Ue',
  'ß': 'ss',
};
const slug = (text, max) =>
  String(text || '')
    .replace(/[äöüÄÖÜß]/g, (c) => tausch[c])
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'ohne-Angabe';

// Short fingerprint of a photo: a changed photo is mailed again, an unchanged one never twice.
const fingerabdruck = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${s.length}-${h}`;
};

const bekannt = new Map(); // marker key -> hash
for (const r of rows) {
  if (r && r.kind === 'fotoversand' && typeof r.data === 'string') {
    try {
      bekannt.set(r.key, JSON.parse(r.data).hash);
    } catch {
      /* broken marker: the photo is simply mailed again */
    }
  }
}

const ausgabe = [];
for (const r of rows) {
  if (!r || r.kind !== 'dayNote' || typeof r.data !== 'string') continue;
  let item;
  try {
    item = JSON.parse(r.data);
  } catch {
    continue;
  }
  const rapport = item.rapport;
  if (!rapport || rapport.done !== true || !Array.isArray(rapport.photos)) continue;
  const fotos = rapport.photos.filter(
    (p) => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,'),
  );
  for (let i = 0; i < fotos.length; i += 1) {
    const markerKey = `foto:${r.key}:${i + 1}`;
    const hash = fingerabdruck(fotos[i]);
    if (bekannt.get(markerKey) === hash) continue;

    const adresse = (item.address || '').trim();
    const dateiname = `${item.date}_${slug(r.employee, 30)}_Rapport_${slug(rapport.text, 40)}_${i + 1}.jpg`;
    const stunden = String(rapport.hours).replace('.', ',');
    const bytes = Buffer.from(fotos[i].slice('data:image/jpeg;base64,'.length), 'base64');
    ausgabe.push({
      json: {
        betreff: `Stempeluhr: Rapport-Foto ${item.date} ${adresse || 'ohne Adresse'} (${r.employee})`,
        text: [
          'Hallo Werner,',
          '',
          'im Anhang ein Foto zu Rapportarbeiten aus der Stempeluhr.',
          '',
          `Datum: ${item.date}`,
          `Mitarbeiter: ${r.employee}`,
          `Adresse: ${adresse || '(keine angegeben)'}`,
          `Rapport Stunden: ${stunden}`,
          `Rapport Arbeiten: ${rapport.text}`,
          `Foto: ${i + 1} von ${fotos.length}`,
          `Dateiname: ${dateiname}`,
          '',
          'Das Foto ist ein Beleg. Es wird beim Projekt unter "Rapport-Fotos" abgelegt.',
          '',
          'Automatisch erstellt von n8n.',
        ].join('\n'),
        dateiname,
        markerKey,
        hash,
        employee: r.employee,
        date: item.date,
      },
      binary: { data: await this.helpers.prepareBinaryData(bytes, dateiname, 'image/jpeg') },
    });
  }
}
return ausgabe;
