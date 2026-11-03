# Bauauftrag: n8n für die Stempeluhr Frank

Ziel: Die App schickt jeden Stempel, jede Tagesnotiz und jeden Standort an n8n. n8n legt
freitags um 23:59 Uhr eine Wochenliste und am Monatsletzten eine Monatsliste als Excel in
Werners OneDrive (Brains-Ordner). Werners Claude liest die Dateien von dort.

Die Teilnahme ist am Anfang freiwillig. Fehlt ein Mitarbeiter in der Liste, ist das kein
Fehler: Er schreibt dann noch auf Papier.

Es gelten die Bauregeln aus der Übergabe: Webhook nur mit Header-Auth, keine Zugangsdaten
im Klartext, nichts löschen, Dateien nur im Brains-Ordner, deutsche Baustein-Namen,
höchstens acht Bausteine pro Workflow, Fehler-Melder eintragen. Erst an einer Kopie bauen
und testen. Freischalten macht der Mensch.

## 1. Datentabelle anlegen

n8n → Data Tables → neue Tabelle **`stempel`**, alle Spalten vom Typ Text:

| Spalte     | Inhalt                                                                |
| ---------- | --------------------------------------------------------------------- |
| key        | eindeutiger Schlüssel, z. B. `shift:<id>` oder `note:<Gerät>:<Datum>` |
| kind       | `shift`, `shiftDeleted` oder `dayNote`                                |
| employee   | Name, wie der Mitarbeiter ihn eingetragen hat                         |
| deviceId   | feste Nummer des Handys                                               |
| date       | Tag (JJJJ-MM-TT)                                                      |
| data       | der komplette Eintrag als JSON                                        |
| receivedAt | Empfangszeit                                                          |

## 2. Workflow „Stempeluhr Eingang“ (4 Bausteine)

1. **Webhook „Stempel empfangen“**: POST, Pfad `stempeluhr`.
   - Authentifizierung: Header Auth. Neue Zugangsdaten anlegen: Name `X-Stempel-Key`,
     Wert = Firmenschlüssel aus der Datei `FIRMENSCHLUESSEL.txt` (liegt bei Max, nicht im
     Repository). Denselben Schlüssel tragen die Mitarbeiter in der App ein.
   - Optionen → Allowed Origins (CORS): `https://maximilianfrank64-crypto.github.io`
     (bzw. die Adresse, unter der die App läuft).
   - Respond: „When Last Node Finishes“.
2. **Code „Eingang prüfen“**: Mode „Run Once for Each Item“, Inhalt von
   [`eingang.js`](eingang.js) einfügen.
3. **Data Table „Speichern“**: Tabelle `stempel`, Operation **Upsert**, Abgleich über
   Spalte `key`, alle Spalten aus dem Code übernehmen.
4. Fehler-Workflow in den Einstellungen eintragen.

Ein Löschen in der App (`shiftDeleted`) überschreibt nur den Eintrag mit dieser Art. Es wird
nichts gelöscht, der Bericht lässt solche Einträge einfach weg.

Die **Produktions-URL** des Webhooks kommt danach in GitHub: Repository → Settings →
Secrets and variables → Actions → Variables → `SYNC_URL`. Beim nächsten Hochladen baut
GitHub die App mit dieser Adresse.

## 3. Workflow „Stempeluhr Bericht“ (5 Bausteine)

Workflow-Einstellungen: Zeitzone **Europe/Berlin**.

1. **Schedule Trigger „Jeden Abend“**: zwei Regeln, täglich **23:58** und **23:59**.
   23:58 ist der Monatslauf (nur am Monatsletzten), 23:59 der Wochenlauf (nur freitags).
   So entsteht pro Lauf genau eine Datei, auch wenn ein Freitag der Monatsletzte ist.
2. **Data Table „Alle Einträge holen“**: Tabelle `stempel`, Get Many, Return All.
3. **Code „Bericht bauen“**: Mode „Run Once for All Items“, Inhalt von
   [`bericht.js`](bericht.js). Ist heute nichts fällig, gibt er nichts aus und der
   Workflow endet hier.
4. **Convert to File „Excel erstellen“**: Operation „Convert to XLSX“, Kopfzeile an,
   Blattname `Stunden`.
5. **Microsoft OneDrive „Ablegen“**: Upload, Ordner `Brains/Stempeluhr`,
   Dateiname `{{ $execution.customData.get('datei') }}`.

Dateinamen: `Stunden_Woche_2026-10-31_bis_2026-11-06.xlsx`,
`Stunden_Monat_2026-10-01_bis_2026-10-31.xlsx`.

## 4. Was in der Excel-Liste steht

Eine Zeile pro Schicht, pro Mitarbeiter eine Zeile `SUMME` am Ende.

| Spalte                          | Bedeutung                                                                |
| ------------------------------- | ------------------------------------------------------------------------ |
| Mitarbeiter, Datum, Tag         | wer, wann                                                                |
| Beginn, Ende                    | exakte Uhrzeit, nicht gerundet                                           |
| Pause (Min)                     | erfasste Pause, plus automatischer Abzug, falls in der App eingeschaltet |
| Stunden                         | Arbeitszeit dezimal, leer wenn nicht ausgestempelt                       |
| Baustelle und Arbeiten          | Pflichtfeld aus der App                                                  |
| Rapport (Std), Rapport Arbeiten | Rapportarbeiten des Tages; 0 = bewusst „Nein“ gesagt                     |
| GPS Ein, GPS Aus                | Google-Maps-Link zum Standort beim Stempeln                              |
| Hinweis                         | alles, wo nachgefragt werden sollte                                      |

Mögliche Hinweise: „automatisch um 23:59 ausgestempelt, bitte nachfragen“ (vergessen
auszustempeln, die echte Zeit steht oft in der Notiz), „nicht ausgestempelt, bitte
nachfragen“ (Handy seitdem nicht mehr geöffnet), „von Hand nachgetragen“,
„Baustelle/Arbeiten fehlen“, „Rapport-Frage nicht beantwortet“, „Standort abgelehnt“,
„kein GPS“, „Standort ungenau (… m)“.

Rundung, Soll und Lohn rechnet die App bewusst nicht. Das entscheidet Werners Claude bzw.
WinWorker.

## 5. Auftrag an Werners Claude (Vorschlag)

Die ausführliche Anleitung für Werners Claude steht in
[`FUER-WERNERS-CLAUDE.md`](FUER-WERNERS-CLAUDE.md). Die Datei in seine Brains/Projekt-Dateien
legen. Kurzfassung:

> In `Brains/Stempeluhr` liegen jeden Freitag eine Wochenliste und am Monatsende eine
> Monatsliste. Trag die Stunden in WinWorker ein. Rapportarbeiten stehen in den Spalten
> „Rapport (Std)“ und „Rapport Arbeiten“, sie gehören auf die Baustelle aus „Baustelle und
> Arbeiten“. Zeilen mit einem Hinweis nicht eintragen, sondern mir als Liste geben, damit ich
> nachfrage. Stichprobe: Öffne bei ein paar Zeilen den GPS-Link und vergleiche ihn mit der
> Baustelle. Melde, wenn der Standort mehr als etwa 1 km davon entfernt ist. Nicht alle
> Mitarbeiter nutzen die App, fehlende Namen sind kein Fehler.

Kosten: Die Liste ist klein, das Lesen kostet wenige Cent. Teurer wird nur, wenn Claude
jeden GPS-Link einzeln prüft. Deshalb Stichproben statt alles.

## 6. Aufbewahrung

Die App löscht auf dem Handy alles, was älter als 2 Jahre ist. In n8n wird nichts
automatisch gelöscht. Die Excel-Dateien in OneDrive sind das Archiv. Arbeitszeitnachweise
müssen nach meinem Stand mindestens 2 Jahre aufbewahrt werden, Lohnunterlagen länger. Die
genaue Frist mit dem Steuerberater klären, bevor irgendetwas gelöscht wird.

## 7. Vor dem Start

- Die Mitarbeiter stimmen dem Standort beim Stempeln schriftlich zu (Standortdaten von
  Beschäftigten, DSGVO). Den Text vorher kurz vom Verbandsanwalt prüfen lassen.
- Test mit einem Handy: einstempeln, ausstempeln, prüfen ob die Zeile in `stempel` ankommt.
  Dann den Bericht-Workflow einmal von Hand starten (vorher in `bericht.js` testweise den
  Tag fest setzen) und die Excel-Datei ansehen.
- Falls das Senden im Browser mit einem CORS-Fehler scheitert: In n8n prüfen, ob „Allowed
  Origins“ gesetzt ist und der Webhook im Produktionsmodus läuft (Workflow aktiv).
