# Besucher Manager

Interne Besucherverwaltung fuer Wache, Empfang und Administration.

## Aktueller Stand (MVP)

- Node.js/TypeScript Monorepo (`apps/backend`, `apps/frontend`)
- Docker-only Betrieb (kein Django, kein Python-Backend)
- Microsoft SQL Server 2022 als Compose-Service mit Bootstrap-Container
- Oeffentliche Voranmeldung mit CSRF + Rate-Limit
- Oeffentliche Gruppen-Voranmeldung als Formular
- Oeffentlicher Besucher-Import per Excel
- SiBe-Freigabeworkflow fuer Voranmeldungen vor dem Check-in
- SMTP-/E-Mail-Relay im Admin-System konfigurierbar
- Login mit Rollen `admin`, `guard`, `sibe` und `kaskdt`
- Menuebasierte Rechte und Benutzergruppen im Admin-Panel
- Guard-Login mit Wache-Auswahl bei jeder Anmeldung
- Wache-Tagesuebersicht mit Suche/Filter, Check-in, Check-out, Druck
- Besucherdetailseite
- Importbereich mit Excel-Vorlage und Nachbearbeitungsstatus
- SiBe-/KasKdt-Dashboard mit Besucher-, Besuchs- und Benutzerrecherche
- Admin-Panel mit Dashboard sowie getrennten Bereichen fuer Wachen, Benutzer, Texte, Gelaendeplan, Felder, Auditlog, Fehlerlog und System
- Texte-Bearbeitung mit Suche, Typ-/Statusfiltern, Vorschau, Druck und Aktiv/Inaktiv-Schaltung
- Auditlog im Admin mit Suche, Filtern und metadata_json-Detailansicht
- Fehlerlog im Admin mit Request-, Benutzer- und Stacktrace-Daten
- Gelaendeplan-Upload per Drag-and-Drop im Admin-Panel
- Dark Mode mit Persistenz (`localStorage`)
- Globaler Hintergrund wird im Adminbereich ueber die Hintergrundverwaltung gesetzt
- Ausweisdaten bereits in der Voranmeldung und im Import
- Excel-Importvorlage mit vereinfachtem Aufbau und Download aus der App

## Wichtige Routen

- `/` Voranmeldung
- `/login` Anmeldung
- `/wache` Tagesuebersicht Wache
- `/wache/besuche/:id` Besucherdetails
- `/wache/besuche/:id/druck` Druckansicht
- `/import` Besucher-Import
- `/genehmigungen` Offene SiBe-Freigaben
- `/sibe` SiBe-Dashboard
- `/kaskdt` KasKdt-Dashboard
- `/kaskdt/texte` Texte-Bearbeitung
- `/sibe/besucher` Besucher- und Besuchsrecherche
- `/sibe/benutzer` Benutzerrecherche
- `/admin` Administration

## Rollen und Zugriff

- Nicht eingeloggt: Voranmeldung, Gruppenformular, Import, Login
- Guard: Wache, Import
- SiBe: Genehmigung, SiBe, Import
- KasKdt: KasKdt, Import, Texte
- Admin: alle Menues
- Benutzer koennen zusaetzlich ueber Menuepunkte freigeschaltet oder eingeschraenkt werden.
- API-Schutz serverseitig ueber Rollenpruefung, Menuefreigaben und Wache-Scope

## Technischer Betrieb

- App-Port: `3030`
- SQL-Port: `1433`
- keine lokale `npm install` Ausfuehrung auf dem Server notwendig
- Build + Runtime laufen im Docker-Container
- `sqlserver_data` haelt die MSSQL-Daten persistent
- `uploads_data` haelt Uploads wie Gelaendeplaene persistent
- Updates laufen ueber `npm run ops:update` oder `docker compose build app && docker compose up -d`

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
npm run ops:update
```

Fuer Installationen hinter Firmenproxy oder Reverse Proxy siehe:

- [DEPLOYMENT.md](/root/Besucher_Manager/DEPLOYMENT.md)
- Dort sind getrennt beschrieben:
  - Outbound-Proxy fuer Docker-Build und Runtime
  - Reverse Proxy mit HTTPS
  - `PUBLIC_BASE_URL`, `APP_SECURE_COOKIES` und `APP_TRUST_PROXY`

Zieladresse:

```text
http://deb-srv-docker:3030
```

## Sicherheitsregeln

- keine Secrets committen
- `.env` bleibt lokal auf dem Server
- alle sicherheitsrelevanten Regeln serverseitig (Rollen, Scope, Statusuebergaenge)
- Passwoerter nur gehasht speichern
- keine physischen SQL-Loeschungen fuer Kernobjekte

## Datenhaltung

- `users` = Anwendungskonten
- `user_groups` = frei definierbare Benutzergruppen
- `user_menu_access` = freigeschaltete Menuepunkte pro Benutzer
- `visitors` = externe Besucher
- `visits` = konkrete Besuchsvorgaenge
- `visitors.birth_date` = optionales Geburtsdatum externer Besucher
- `error_logs` = technische Fehler fuer die Admin-Auswertung
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

## Oeffentliche Voranmeldung und Gruppenformular

- Das Formular `/` enthaelt Besuchs-, Ansprechpartner- und Ausweisdaten.
- Eine Wache kann bereits in der Voranmeldung mitgegeben werden.
- Es gibt zusaetzlich ein Gruppenformular fuer mehrere Besucher mit gemeinsamen Besuchsdaten.
- Abgelaufene Ausweisdokumente werden im Formular sichtbar als Fehler markiert.
- Unvollstaendige Import- oder Gruppenzeilen koennen spaeter durch die Wache nachbearbeitet werden.
- Wenn die Freigabepflicht aktiv ist, werden neue Voranmeldungen zunaechst mit `Freigabe offen` angelegt.
- Erst nach SiBe-Freigabe ist der Guard-Check-in moeglich.

## Besucher-Import

- Route: `/import`
- Ohne Login verfuegbar fuer oeffentlichen Import.
- Mit Login verfuegbar fuer `guard`, `sibe`, `kaskdt` und `admin`.
- Unterstuetzte Formate: `XLSX`, `XLS`
- Downloadbare Vorlage:
  - `Excel-Vorlage herunterladen`
- Die Excel-Vorlage ist bewusst vereinfacht und enthaelt Pflicht-/Optionalspalten sowie Dropdown-Hilfen.
- Fehlende Daten blockieren den Import nicht grundsaetzlich; solche Eintraege werden mit Nachbearbeitungsbedarf markiert.
- Mit Login verlinkt das Ergebnis direkt in die Detailbearbeitung des angelegten Besuchs.
- Oeffentliche und Guard-Importe gehen bei aktiver Freigabepflicht zuerst in die SiBe-Freigabe.
- Admin- und SiBe-Importe koennen direkt als freigegeben angelegt werden.

## SiBe-Freigabe und E-Mail-Relay

- Admin -> `System` enthaelt die Konfiguration fuer den Freigabeworkflow.
- Schalter `SiBe-Freigabe vor Check-in erzwingen` aktiviert den Pflichtprozess.
- Das Mail-Relay kann weiter im Admin gepflegt werden.
- Fuer den produktiven Betrieb wird jetzt eine YML-Datei unter `config/mail-relay.yml` empfohlen.
- Wenn die YML-Datei vorhanden ist, liest die App die SMTP-Relay-Daten daraus und zeigt sie im Admin nur noch lesend an.
- Mit `Testmail senden` kann die Verbindung direkt aus dem Admin-Panel geprueft werden.
- Bei neuer Voranmeldung koennen SiBe-Empfaenger per E-Mail informiert werden.
- Freigabe oder Ablehnung erfolgt in `/sibe/besucher/:id`.
- Eine Ablehnung kann mit Hinweis dokumentiert werden.

Beispiel fuer `config/mail-relay.yml`:

```yaml
mailRelay:
  enabled: true
  host: smtp-relay.intern.example
  port: 587
  secure: false
  username: relay-user
  password: relay-pass
  fromAddress: "Besucher Manager <noreply@example.org>"
  approvalRecipients:
    - sibe1@example.org
    - sibe2@example.org
```

## Texte-Bearbeitung

- Eigene Texte-Seite unter `/kaskdt/texte`
- Zugriff fuer `admin` und `kaskdt`
- Suche nach Name, Typ und Inhalt
- Filter nach Typ und Status
- Vorschau und separate Druckvorschau
- Duplizieren, Zuruecksetzen sowie Aktiv/Inaktiv-Schaltung
- Freie Texttypen zusaetzlich zu den Standardtypen fuer Druckausgabe

## Benutzer und Rechte

- Guard-Benutzer waehlen bei jeder Anmeldung ihre aktive Wache neu aus.
- Admin-Benutzer pflegen Rollen, Gruppen und Menuezugriffe im Admin-Panel.
- Standard-Menues:
  - `wache`
  - `import`
  - `admin`
  - `sibe`
  - `kaskdt`
  - `texte`
- Die Zielseite nach dem Login wird aus den erlaubten Menues bestimmt.

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
- `Gruppenformular`: oeffentlich ueber `/`
- `Import`: oeffentlich ueber `/import` oder intern mit Login
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

Die Standard-Seed-Benutzer koennen vorher oder separat mit folgendem Wrapper geladen werden:

```bash
npm run seed:sample
```

Der Wrapper nutzt im Docker-Betrieb automatisch den laufenden `app`-Container. Ohne laufenden Container setzt er lokal bei Bedarf `MSSQL_HOST=127.0.0.1`, damit das Seed auch mit dem Standard-Compose-Setup funktioniert.
Die Verifikationsskripte lesen `ADMIN_USERNAME` und `ADMIN_PASSWORD` automatisch aus der Projekt-`.env`, falls keine Parameter uebergeben werden.

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
  --base-url http://deb-srv-docker:3030 \
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

- Hintergrundbild: im Adminbereich unter `Hintergrund` hochladbar

## Feldkonfiguration (MVP Stufe 1)

- Admin-Bereich enthaelt den Tab `Felder` zur Konfiguration von Systemfeldern.
- Sichtbarkeit und Pflichtregeln koennen pro Kontext gesetzt werden:
  - `show_in_public`
  - `show_in_guard`
  - `show_in_sibe`
  - `show_on_badge`
  - `required_public`
  - `required_guard_checkin`
  - `required_before_print`
- Pflichtpruefungen fuer Wache/Check-in und Druck werden serverseitig aus `field_definitions` gelesen.
- Deaktivierte Felder bleiben in Daten und Historie erhalten; es gibt keine physische Loeschung ueber die UI.
- Eigene Zusatzfelder (Custom Fields) sind als Datenmodell vorbereitet und folgen in der naechsten Ausbaustufe.

### Export / Import der Feldkonfiguration

- Nur Admin kann Felddefinitionen als JSON exportieren und importieren.
- Exportformat ist versioniert (`schema: besucher-manager-field-config`, `version: 1`).
- Export enthaelt ausschliesslich Felddefinitionen (System- und Custom-Felder), keine Besuchs-/Benutzer-/Auditdaten.
- Import laeuft im sicheren Merge-Modus:
  - vorhandene Felder werden ueber `fieldKey` aktualisiert,
  - neue `fieldKey`s werden als Custom Fields angelegt,
  - nicht enthaltene Felder bleiben unveraendert,
  - es werden keine Daten physisch geloescht.
