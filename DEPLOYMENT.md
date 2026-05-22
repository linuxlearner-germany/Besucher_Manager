# Deployment (deb-srv-docker)

Diese Anwendung wird ausschliesslich per Docker betrieben.

## Zielumgebung

- Docker-Host: `deb-srv-docker`
- SQL-Server: `MS-SRV-SQL`
- Datenbank: `Besuchermngmt`
- App-Port: `3020`

## Wichtige Regeln

- kein Django / kein Python
- kein manuelles `npm install` auf dem Server
- keine Secrets in Git
- `.env` nur lokal auf dem Server pflegen
- Rollen im System: `admin`, `guard`, `sibe`
- Daten werden nicht physisch geloescht

## 1) Repository vorbereiten

```bash
cd /opt
git clone https://github.com/linuxlearner-germany/Besucher_Manager.git
cd Besucher_Manager
cp .env.example .env
```

## 2) `.env` pflegen

Beispielwerte (Platzhalter):

```env
NODE_ENV=production
APP_HOST=0.0.0.0
APP_PORT=3020
APP_SECRET=CHANGE_ME
ADMIN_USERNAME=admin
ADMIN_PASSWORD=CHANGE_ME
PUBLIC_BASE_URL=http://deb-srv-docker:3020
APP_SECURE_COOKIES=false

MSSQL_HOST=MS-SRV-SQL
MSSQL_PORT=1433
MSSQL_DATABASE=Besuchermngmt
MSSQL_USER=dockerBesuchermngmt
MSSQL_PASSWORD=CHANGE_ME
MSSQL_ENCRYPT=false
MSSQL_TRUST_SERVER_CERTIFICATE=true

UPLOAD_DIR=/app/uploads
VISITOR_RETENTION_DAYS=90
PUBLIC_FORM_RATE_LIMIT=5
PUBLIC_FORM_RATE_WINDOW_SECONDS=300
```

## 3) Build und Start

```bash
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d
docker compose logs -f app
```

## 4) Health und Erreichbarkeit

```bash
curl -s http://localhost:3020/health
curl -s http://localhost:3020/api/health
```

Browser:

```text
http://deb-srv-docker:3020
```

## 5) Betriebsnotizen

- Migrationen laufen automatisch beim Containerstart.
- Start-Admin wird aus `ADMIN_USERNAME`/`ADMIN_PASSWORD` erstellt oder aktualisiert.
- Bei SQL-Login-Fehlern (`ELOGIN`) zuerst SQL-Login/Passwort/Rechte auf `MS-SRV-SQL` pruefen.
- Uploads liegen persistent im Docker-Volume `uploads_data:/app/uploads`.
- Wichtige Routen:
  - `/`
  - `/login`
  - `/wache`
  - `/wache/besuche/:id`
  - `/wache/besuche/:id/druck`
  - `/sibe`
  - `/sibe/besucher`
  - `/sibe/benutzer`
  - `/admin`
- Admin-Oberflaeche:
  - Dashboard
  - Wachen
  - Benutzer
  - Texte
  - Karte
  - Audit
  - System
- Tabellen-Trennung:
  - `users` = Anwendungskonten
  - `visitors` = externe Besucher
  - `visits` = konkrete Besuchsvorgaenge
- Operativer Ablauf:
  - Voranmeldung -> Wache -> Check-in -> Druck -> Check-out mit Unterschrift -> Auditlog
- Wache kann Voranmeldedaten vor dem Check-in in der Detailansicht korrigieren oder ergaenzen.

## 5a) Gelaendeplan hochladen

- Upload erfolgt im Admin-Panel per Drag-and-Drop.
- Erlaubte Dateitypen: `PNG`, `JPG/JPEG`, `WEBP`
- Maximale Dateigroesse: `10 MB`
- Speicherort im Container: `/app/uploads/site-maps/`
- Neue Plaene werden aktiv gesetzt.
- Alte Plaene bleiben erhalten und werden nur deaktiviert.
- Der aktive Plan erscheint auf dem Besucherschein.

## 5b) Besucherschein drucken

- Druckansicht: `/wache/besuche/:id/druck`
- Header und Navigation werden ueber Print-CSS ausgeblendet.
- Wenn Browser URL, Datum oder Seitenzahl mitdrucken, im Druckdialog die Option fuer Kopf- und Fusszeilen deaktivieren.
- Kein QR-Code im Besucherschein.

## 5c) Check-out mit Unterschriftsstatus

Statuswerte:

- `pending`
- `signed_same_day`
- `signed_later`
- `missing_exception`
- `not_required`

Regeln:

- `signed_same_day`: sofort vorhanden
- `signed_later`: Datum der nachgereichten Unterschrift erforderlich
- `missing_exception`: Begruendung erforderlich
- `pending`: blockiert den Check-out

Alle neuen App-Daten bleiben ohne physische Loeschung erhalten; Aenderungen und Check-out-Aktionen werden im Auditlog protokolliert.

## 6) Legacy-Django-Tabellen bereinigen

- Die laufende Anwendung verwendet kein Django mehr.
- Vor dem Cleanup immer ein Datenbankbackup erstellen.
- Optionales Hilfsscript: [docs/sql/backup_legacy_django_tables.sql](/root/Besucher_Manager/docs/sql/backup_legacy_django_tables.sql)
- Die Cleanup-Migration entfernt nur alte Legacy-Tabellen:
  - `auth_*`
  - `django_*`
  - `core_*`
  - `visits_visit`
  - `visits_visitor`
- Die neuen Zieltabellen bleiben ausdruecklich erhalten:
  - `users`
  - `visitors`
  - `visits`
  - `gates`
  - `site_maps`
  - `badge_text_templates`
  - `system_settings`
  - `audit_logs`
  - `schema_migrations`

Nach Deployment/Start pruefen:

```sql
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'dbo'
ORDER BY TABLE_NAME;
```

In DataGrip:

1. Rechtsklick auf Datenquelle oder Schema
2. `Synchronize`
3. Alte `auth_*`, `django_*`, `core_*`, `visits_visit`, `visits_visitor` sollten verschwunden sein
4. Neues ER-Diagramm aus den Zieltabellen erzeugen
