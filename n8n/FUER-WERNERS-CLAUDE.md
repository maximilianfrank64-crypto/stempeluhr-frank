# Stempeluhr: Stundenlisten für WinWorker

Diese Datei erklärt dir, Claude, woher die Arbeitsstunden der Mitarbeiter kommen und wie
du sie für Werner aufbereitest. Werner trägt sie in WinWorker ein, von Hand oder mit deiner
Hilfe.

## Woher die Daten kommen

Die Mitarbeiter stempeln mit der App „Stempeluhr Frank“ auf dem Handy ein und aus. Jeder
Stempel geht automatisch an n8n. n8n schickt daraus Excel-Listen **per E-Mail an Werner**,
von seiner eigenen Adresse an seine eigene Adresse:

- **Wochenliste:** jeden **Freitag um 23:59 Uhr**, Samstag bis Freitag.
  Betreff: `Stempeluhr: Stunden Woche <von> bis <bis>`
  Anhang: `Stunden_Woche_<von>_bis_<bis>.xlsx`, z. B. `Stunden_Woche_2026-10-31_bis_2026-11-06.xlsx`
- **Monatsliste:** am **letzten Tag des Monats um 23:58 Uhr**, egal welcher Wochentag.
  Betreff: `Stempeluhr: Stunden Monat <von> bis <bis>`
  Anhang: `Stunden_Monat_<von>_bis_<bis>.xlsx`

Du schaust ohnehin regelmäßig nach neuen Mails. Erkennst du eine Mail mit dem Betreff
„Stempeluhr: Stunden …“, speichere den Anhang in Werners Ordner `Stempeluhr` (im Brains-Ordner)
und arbeite ihn wie unten beschrieben ab. Die Mail nicht löschen, sie ist das Archiv. Kommt
dieselbe Liste doppelt, gilt die neuere.

Die App ist zu Beginn **freiwillig**. Nicht jeder Mitarbeiter nutzt sie, manche schreiben
noch auf Papier. Fehlt ein Name in der Liste, ist das kein Fehler und kein Grund nachzufragen.

## Was in der Liste steht

Blatt `Stunden`, eine Zeile pro Schicht. Am Ende jedes Mitarbeiters steht eine Zeile mit
`SUMME` im Feld Datum.

| Spalte | Bedeutung |
| --- | --- |
| Mitarbeiter | Name, wie ihn der Mitarbeiter in der App eingetragen hat |
| Datum, Tag | Arbeitstag (TT.MM.JJJJ) und Wochentag |
| Beginn, Ende | exakte Uhrzeit, **nicht gerundet** |
| Pause (Min) | Pause in Minuten, inklusive automatischem Pausenabzug, falls eingeschaltet |
| Stunden | Arbeitszeit dezimal (7,5 = 7 Std 30 Min); leer, wenn nicht ausgestempelt |
| Baustelle und Arbeiten | wo gearbeitet wurde und was gemacht wurde (Pflichtfeld) |
| Rapport (Std) | Rapportarbeiten des Tages in Stunden; `0` = Mitarbeiter hat bewusst „Nein“ gesagt |
| Rapport Arbeiten | was als Rapport gemacht wurde |
| GPS Ein, GPS Aus | Google-Maps-Link zum Standort beim Ein- und Ausstempeln |
| Hinweis | Gründe, warum Werner nachfragen sollte; leer = alles in Ordnung |

Rapport steht nur in der ersten Zeile eines Tages, auch wenn jemand mehrmals gestempelt hat.

## So gehst du vor

1. Datei öffnen und kurz zusammenfassen: Zeitraum, welche Mitarbeiter, Gesamtstunden pro
   Mitarbeiter (aus den `SUMME`-Zeilen).
2. **Zeilen ohne Hinweis** für WinWorker vorbereiten: pro Mitarbeiter und Tag Datum,
   Baustelle, Stunden. Nach Baustelle gruppieren, wenn Werner das so einträgt.
3. **Rapportarbeiten getrennt auflisten:** Mitarbeiter, Datum, Baustelle, Rapport-Stunden,
   Rapport-Arbeiten. Rapport ist abrechenbare Zusatzarbeit und darf nicht untergehen. Sie
   gehört zur Baustelle aus „Baustelle und Arbeiten“ desselben Tages.
4. **Zeilen mit Hinweis nicht eintragen**, sondern Werner als Nachfrage-Liste geben:
   Mitarbeiter, Datum, Hinweis, und was in „Baustelle und Arbeiten“ steht.
5. **GPS-Stichprobe** (siehe unten).
6. Erst wenn Werner die Liste bestätigt hat, in WinWorker eintragen oder ihm beim Eintragen
   helfen.

Rundung, Soll-Stunden, Überstunden und Lohn rechnet die App bewusst nicht. Wie gerundet
wird, legt Werner fest. Frag ihn beim ersten Mal und merk dir seine Regel.

## Was die Hinweise bedeuten

| Hinweis | Was tun |
| --- | --- |
| automatisch um 23:59 ausgestempelt, bitte nachfragen | Mitarbeiter hat vergessen auszustempeln. Oft steht die echte Endzeit in „Baustelle und Arbeiten“. Werner fragen, welche Zeit gilt. |
| nicht ausgestempelt, bitte nachfragen | Handy wurde seitdem nicht mehr geöffnet, Ende unbekannt. Nachfragen. |
| von Hand nachgetragen | Zeit wurde in der App nachträglich eingetragen, nicht gestempelt. Plausibel prüfen. |
| Baustelle/Arbeiten fehlen | Kommt selten vor, weil das Feld Pflicht ist. Nachfragen, wo gearbeitet wurde. |
| Rapport-Frage nicht beantwortet | Unklar, ob es Rapport gab. Nachfragen. |
| Ein/Aus: Standort abgelehnt | Mitarbeiter hat den Standort am Handy nicht erlaubt. Werner darauf hinweisen. |
| Ein/Aus: kein GPS | Kein Signal beim Stempeln. Einmal ist normal, ständig nicht. |
| Standort ungenau (… m) | GPS war ungenau, die Stichprobe ist dann wenig aussagekräftig. |

## GPS-Stichprobe

Ziel: grob prüfen, ob auf der Baustelle gestempelt wurde, auf der laut Notiz gearbeitet
wurde. Das ist eine Stichprobe, keine Überwachung jedes Stempels.

- Nimm pro Liste ein paar Zeilen, nicht alle. Das spart Kosten und Zeit.
- Öffne den Link in „GPS Ein“ und vergleiche den Ort mit der Adresse in „Baustelle und
  Arbeiten“.
- Melde Werner nur auffällige Fälle, also mehr als etwa 1 km Abstand zur Baustelle. Nenne
  Mitarbeiter, Datum, Baustelle und Link.
- Sei vorsichtig mit Vorwürfen: Material holen, Zweitbaustelle oder ungenaues GPS sind
  normale Gründe. Du meldest nur, Werner entscheidet.

## Datenschutz

Die Listen enthalten Namen, Arbeitszeiten und Standorte der Mitarbeiter. Nichts davon
weitergeben, nicht ins Internet hochladen und nur für Lohn und Abrechnung verwenden.

## Bei Problemen

- **Samstagmorgen keine Mail „Stempeluhr: Stunden Woche …“:** Werner Bescheid geben, Max
  prüft den Workflow „Stempeluhr - Bericht“ in n8n. Du selbst hast keinen Zugang zu n8n und
  brauchst ihn nicht.
- **Ein Mitarbeiter sagt, er hat gestempelt, steht aber nicht drin:** Er soll die App
  öffnen. Auf der Startseite steht, ob alles ans Büro gesendet ist. Ohne Netz sendet die App
  später nach.
- **Neuer Mitarbeiter will mitmachen:** Er installiert die App, trägt in den Einstellungen
  unter „Firma“ seinen Namen und den Firmenschlüssel ein. Den Schlüssel hat Werner. Er gehört
  nicht in Chats, auch nicht in diesen.
