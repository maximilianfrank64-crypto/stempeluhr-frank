# Stempeluhr Frank

Stempeluhr für den Stuckateurbetrieb Frank, als Web-App fürs Handy (PWA). Sie ersetzt den
Stundenzettel auf Papier. Abgeleitet von [punch-clock](https://github.com/maximilianfrank64-crypto/punch-clock).

## Was die App macht

- **Ein- und ausstempeln** mit einem Tipp, Pausen, Verlauf, Export (CSV, Excel, PDF …).
- **Exakte Zeiten:** keine Rundung, kein Soll, kein Lohn. Das entscheidet das Büro.
- **Pflichtangaben beim Ausstempeln:** „Baustelle und Arbeiten“ und die Frage „Gab es heute
  Rapportarbeiten?“ (bewusst Ja oder Nein, bei Ja Stunden und was gemacht wurde).
- **Automatisch ausgestempelt um 23:59**, wenn jemand es vergisst, mit Hinweis fürs Büro.
- **Automatischer Pausenabzug** (in den Einstellungen einschaltbar).
- **Senden ans Büro** (freiwillig): Mit Name und Firmenschlüssel geht jeder Stempel samt
  Standort beim Ein- und Ausstempeln an einen n8n-Webhook. Ohne Netz wartet die App und
  sendet später. Ohne Einrichtung bleibt alles auf dem Handy.
- **2 Jahre Verlauf** auf dem Handy, Älteres wird dort automatisch gelöscht.
- Helle Oberfläche in warmem Putz-Weiß.

Wöchentliche (Freitag 23:59) und monatliche Excel-Listen baut n8n, siehe
[n8n/BAUAUFTRAG.md](n8n/BAUAUFTRAG.md).

## Entwicklung

Node.js 22.

```bash
npm install
npm run dev          # http://localhost:5173
npm run check        # Lint + Typprüfung + Tests
npm run build        # Produktions-Build nach dist/
```

Die n8n-Adresse kommt beim Bauen aus der Umgebungsvariable `VITE_SYNC_URL`
(GitHub: Repository-Variable `SYNC_URL`, siehe `.github/workflows/deploy.yml`).

### Aufbau

```
src/
  core/        Logik ohne UI: Stempeln, Berechnung, Berichte, Export, Versand-Format (sync.ts)
  db/          IndexedDB (Dexie): Schichten, Tagesnotizen, Warteschlange (outbox)
  store/       Zustand-Store: speichert sofort, stellt in die Warteschlange, sendet
  sync/        GPS-Abfrage und HTTP-Versand
  features/    Bildschirme
n8n/           Code für die n8n-Code-Bausteine und der Bauauftrag
```

## Veröffentlichen (GitHub Pages)

1. Neues Repository anlegen und den Code hochladen.
2. Settings → Pages → Source: GitHub Actions.
3. Settings → Secrets and variables → Actions → Variables → `SYNC_URL` = n8n-Webhook.
4. Nach dem Durchlauf liegt die App unter `https://<user>.github.io/<repo>/`.

Auf dem iPhone in Safari öffnen → Teilen → „Zum Home-Bildschirm“.

## Datenschutz

Mit eingerichtetem Senden gehen Name, Arbeitszeiten, Tagesnotizen, Rapport-Angaben und der
Standort beim Ein- und Ausstempeln an das Büro. Der Standort wird nur im Moment des
Stempelns abgefragt. Vor dem Einsatz schriftliche Zustimmung der Mitarbeiter einholen.
