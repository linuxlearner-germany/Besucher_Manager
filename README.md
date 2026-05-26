# Besucher Manager

Interne Besucherverwaltung fuer Wache, Empfang und Administration.

## Aktueller Stand (MVP)

- Node.js/TypeScript Monorepo (`apps/backend`, `apps/frontend`)
- Docker-only Betrieb (kein Django, kein Python)
- Externer Microsoft SQL Server
- Oeffentliche Voranmeldung mit CSRF + Rate-Limit
- Login mit Rollen `admin`, `guard` und `sibe`
- Wache-Tagesuebersicht mit Suche/Filter, Check-in, Check-out, Druck
- Besucherdetailseite
- SiBe-Dashboard mit Besucher-, Besuchs- und Benutzerrecherche
- Admin-Panel mit Dashboard sowie getrennten Bereichen fuer Wachen, Benutzer, Hinweistexte, Gelaendeplan, Auditlog und System
- Auditlog im Admin mit Suche, Filtern und metadata_json-Detailansicht
- Gelaendeplan-Upload per Drag-and-Drop im Admin-Panel
- Dark Mode mit Persistenz (`localStorage`)
- Globaler Hintergrund ueber `background.png`
- Besucher koennen optional mit `Geburtsdatum` erfasst werden

## Wichtige Routen

- `/` Voranmeldung
- `/login` Anmeldung
- `/wache` Tagesuebersicht Wache
- `/wache/besuche/:id` Besucherdetails
- `/wache/besuche/:id/druck` Druckansicht
- `/sibe` SiBe-Dashboard
- `/sibe/besucher` Besucher- und Besuchsrecherche
- `/sibe/benutzer` Benutzerrecherche
- `/admin` Administration

## Rollen und Zugriff

- Nicht eingeloggt: Voranmeldung, Login
- Guard: Voranmeldung, Wache
- SiBe: Voranmeldung, SiBe
- Admin: Voranmeldung, Wache, Admin, SiBe
- API-Schutz serverseitig ueber Rollenpruefung und Wache-Scope

## Technischer Betrieb

- App-Port: `3020`
- keine lokale `npm install` Ausfuehrung auf dem Server notwendig
- Build + Runtime laufen im Docker-Container

## Entwicklung lokal

```bash
cp .env.example .env
npm install
npm run typecheck
npm run test:backend
npm run build
```

## Deployment (Docker-only)

```bash
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d
docker compose logs -f app
```

Zieladresse:

```text
http://deb-srv-docker:3020
```

## Sicherheitsregeln

- keine Secrets committen
- `.env` bleibt lokal auf dem Server
- alle sicherheitsrelevanten Regeln serverseitig (Rollen, Scope, Statusuebergaenge)
- Passwoerter nur gehasht speichern
- keine physischen SQL-Loeschungen fuer Kernobjekte

## Datenhaltung

- `users` = Anwendungskonten
- `visitors` = externe Besucher
- `visits` = konkrete Besuchsvorgaenge
- `visitors.birth_date` = optionales Geburtsdatum externer Besucher
- Benutzer werden deaktiviert, nicht geloescht.
- Besucher werden archiviert/markiert, nicht geloescht.
- Besuche werden storniert, nicht geloescht.
- Wachen, Texte und Lageplaene werden deaktiviert, nicht geloescht.

## Gelaendeplan hochladen

- Upload im Admin-Panel per Drag-and-Drop oder Dateiauswahl
- erlaubte Dateitypen: `PNG`, `JPG/JPEG`, `WEBP`
- maximale Dateigroesse: `10 MB`
- Speicherort im Container: `/app/uploads/site-maps/`
- Docker-Volume: `uploads_data:/app/uploads`
- neue Uploads werden automatisch aktiver Gelaendeplan
- alte Plaene bleiben erhalten und werden nur deaktiviert
- der aktive Plan erscheint auf dem Besucherschein

## Besucherschein drucken

- Druckansicht unter `/wache/besuche/:id/druck`
- der aktive Gelaendeplan wird automatisch eingebunden, wenn einer vorhanden ist
- Sicherheitshinweise, Fotografierverbot und Unterschriftsbereich werden kompakt aufbereitet
- zusaetzlich gibt es ein Datumsfeld fuer spaetere Unterschriften des Ansprechpartners
- der Druck ist bewusst auf maximal zwei Seiten strukturiert:
  - Seite 1: Kerndaten + Unterschrift
  - Seite 2: Hinweise + Gelaendeplan (nur wenn Inhalte vorhanden)
- App-Header und Navigation werden beim Drucken ausgeblendet
- falls der Browser URL, Datum oder Seitenzahlen druckt:
  - im Druckdialog die Option fuer Kopf- und Fusszeilen deaktivieren

## Wache: Voranmeldedaten pruefen und ergaenzen

- In `/wache/besuche/:id` kann die Wache vor dem Check-in Voranmeldedaten bearbeiten.
- Bearbeitbar sind Besucher- und Besuchsdaten wie Name, Firma, Geburtsdatum, Ansprechpartner, Abteilung, Zweck, Zeitfenster und Bemerkung.
- Optional ergaenzbar sind zudem papiernahe Felder wie Anschrift, Ausweisdaten, Ansprechpartner-Ort (Gebaeude/Zimmer/Apparat), Besuchszweck-Art sowie mitgefuehrte Geraete.
- Guard-Benutzer duerfen nur Besuche ihrer eigenen Wache bearbeiten.
- Verbotene Felder wie Status, Besuchsnummer, Check-in/Check-out-Zeiten oder technische Herkunftsdaten bleiben serverseitig geschuetzt.
- Aenderungen werden im Auditlog als `VISIT_UPDATED_BY_GUARD` und `VISITOR_UPDATED_BY_GUARD` protokolliert.
- Sensible Ausweisdaten werden nicht in Tabellenlisten angezeigt und nicht im Auditlog-Klartext gespeichert.
- Die Detailansicht zeigt automatisch:
  - blockierende Fehler (fehlen Pflichtdaten)
  - Warnungen (z. B. ueberfaellig / unzugeordnet)
  - Hinweise (optionale Daten fehlen)
- Der Check-in wird serverseitig blockiert, solange Pflichtdaten fuer den operativen Ablauf fehlen.

## Wache-Kalenderansicht

- In `/wache` gibt es die Tabs `Tagesliste` und `Kalender`.
- Der Kalender zeigt geplante und aktive Besuche im Zeitraum.
- Unzugeordnete Voranmeldungen (`gate_id IS NULL`) erscheinen fuer alle Wachen.
- Beim Guard-Check-in wird eine unzugeordnete Voranmeldung automatisch der Guard-Wache zugewiesen.
- Ein Klick auf einen Kalendertag zeigt die Besuchsliste fuer diesen Tag; von dort geht es in die Detailansicht.

## Oeffentliche Voranmeldung ohne Wache

- Das Formular `/` enthaelt keine Wache-Auswahl mehr.
- Oeffentliche Voranmeldungen werden zunaechst ohne feste Wache gespeichert.
- Diese Voranmeldungen erscheinen in allen Wache-Tagesuebersichten.
- Beim Check-in durch einen Guard wird der Besuch automatisch der Guard-Wache zugeordnet.

## Check-out mit Ansprechpartner-Unterschrift

- In der Wache-Maske ist der Check-out bewusst einfach gehalten:
  - Besuchsnummer vom zurueckgegebenen Besucherschein eingeben
  - Checkbox `Unterschrift vom Ansprechpartner erledigt` aktivieren
  - dann `Auschecken`
- Ohne passende Besuchsnummer oder ohne gesetzte Checkbox wird der Check-out abgewiesen.
- Auditlog dokumentiert den Check-out inkl. gepruefter Besuchsnummer.

## Check-out mit Besuchsnummer

- Beim Verlassen gibt der Besucher den Besucherschein an der Wache ab.
- Die Wache muss die Besuchsnummer vom zurueckgegebenen Schein eingeben.
- Das System vergleicht die Eingabe serverseitig mit der gespeicherten Besuchsnummer.
- Erst bei passender Nummer und gueltigem Unterschriftsstatus wird ausgecheckt.
- Auditlog enthaelt `VISIT_CHECKED_OUT` mit Kennzeichen, dass die Besuchsnummer geprueft wurde.

## Besuchsnummer

- Neue Besuchsnummern sind exakt 5-stellig.
- Zeichensatz: `A-Z` und `0-9` (`[A-Z0-9]{5}`).
- Kein Praefix (`B-`), kein `LEGACY`, keine UUID-Teile.
- Die Nummer steht auf dem Besucherschein und wird beim Check-out gegen den gespeicherten Wert geprueft.

Erweiterte Unterschriftsstatus bleiben intern fuer Auswertung/SiBe verfuegbar, sind aber nicht Teil der vereinfachten Standard-Check-out-Maske.

## Legacy-Django-Tabellen bereinigen

- Die Anwendung verwendet kein Django mehr.
- Alte Django-Tabellen koennen nach Pruefung entfernt werden.
- Vorher immer ein Datenbankbackup erstellen.
- Optionales Hilfsscript: [docs/sql/backup_legacy_django_tables.sql](/root/Besucher_Manager/docs/sql/backup_legacy_django_tables.sql)
- Cleanup erfolgt ueber die idempotente Migration `006_cleanup_django_legacy_tables.sql`.
- Zieltabellen der aktuellen App bleiben:
  - `users`
  - `visitors`
  - `visits`
  - `gates`
  - `site_maps`
  - `badge_text_templates`
  - `system_settings`
  - `audit_logs`
  - `schema_migrations`

## DataGrip / SSMS Pruefung

Nach dem Cleanup:

1. In DataGrip Rechtsklick auf Datenquelle oder Schema
2. `Synchronize`
3. Danach sollten alte `auth_*`, `django_*`, `core_*`, `visits_visit` und `visits_visitor` Tabellen verschwunden sein
4. Optional aus den neuen Tabellen ein neues ER-Diagramm erzeugen

SQL-Pruefung:

```sql
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'dbo'
ORDER BY TABLE_NAME;
```

## Bedienablauf kurz

1. Mitarbeiter meldet Besucher vor.
2. Wache sieht Voranmeldung in `/wache`.
3. Wache checkt ein.
4. Besucherschein wird gedruckt.
5. Wache prueft Besuchsnummer + Unterschrift (Checkbox) und checkt aus.
6. Aktionen werden im Auditlog protokolliert.

## Operativer MVP-Ablauf

- `Voranmeldung`: oeffentlich ueber `/`
- `Wache`: Besuch erscheint in `/wache`
- `Check-in`: nur fuer vorangemeldete Besuche
- `Druck`: Besucherschein ueber `/wache/besuche/:id/druck`
- `Check-out`: nur mit passender Besuchsnummer vom Schein und bestaetigter Ansprechpartner-Unterschrift
- `Auditlog`: dokumentiert Voranmeldung, Check-in, Druck und Check-out

## SiBe-Filter

- Zeitraum: `von` / `bis` sowie Schnellfilter (`Heute`, `Gestern`, `Diese Woche`, `Letzte 7 Tage`, `Dieser Monat`)
- Besuchsstatus: `Alle`, `Vorangemeldet`, `Eingecheckt`, `Ausgecheckt`, `Storniert`, `Ueberfaellig`
- Unterschrift: `Alle`, `Offen`, `Am Besuchstag unterschrieben`, `Nachgereicht`, `Ausnahme dokumentiert`, `Nicht erforderlich`
- weitere Filter: Wache, Firma, Ansprechpartner, Kennzeichen, Besuchsnummer

## MVP-Pruefung automatisieren

Fuer einen reproduzierbaren End-to-End-Check gibt es:

```bash
npm run verify:mvp
```

Das Skript prueft:

- oeffentliche Voranmeldung
- Sichtbarkeit in der Wache
- Guard-Bearbeitung
- Check-in
- Druck-Audit
- Check-out mit Unterschriftsstatus
- SiBe-Nachvollziehbarkeit
- Admin-Auditlog

Optional koennen andere Zugangsdaten uebergeben werden:

```bash
python3 scripts/ops/verify_mvp_flow.py \
  --base-url http://deb-srv-docker:3020 \
  --guard-user guard.demo \
  --guard-password Test1234! \
  --sibe-user sibe.demo \
  --sibe-password Test1234! \
  --admin-user admin \
  --admin-password 'DEIN_PASSWORT'
```

Zusaetzlich gibt es einen kompakten Rollen- und Zugriffstest:

```bash
npm run verify:roles
```

Fuer operative Nachverfolgung offener oder nachgereichter Unterschriften:

```bash
npm run report:signatures > unterschriften.csv
```

Fuer einen kompletten Sammellauf:

```bash
npm run verify:ops
```

## Frontend-Assets

- Hintergrundbild: `apps/frontend/public/branding/background.png`
