# Deployment (deb-srv-docker)

Diese Anwendung wird ausschliesslich per Docker betrieben.

## Zielumgebung

- Docker-Host: `deb-srv-docker`
- SQL-Server: `MS-SRV-SQL`
- Datenbank: `Besuchermngmt`
- App-Port: `3030`

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
PUBLIC_BASE_URL=http://deb-srv-docker:3030
PORT=3030
APP_SECURE_COOKIES=false

MSSQL_HOST=MS-SRV-SQL
MSSQL_PORT=1433
MSSQL_DATABASE=Besuchermngmt
MSSQL_USER=dockerBesuchermngmt
MSSQL_PASSWORD=CHANGE_ME
MSSQL_ENCRYPT=false
MSSQL_TRUST_SERVER_CERTIFICATE=true

UPLOAD_DIR=/app/uploads
ADMIN_USERNAME=admin
ADMIN_PASSWORD=CHANGE_ME

APP_SECRET=CHANGE_ME

AUDIT_REVERSE_DNS_ENABLED=false
AUDIT_TRUST_REMOTE_USER_HEADER=false
AUDIT_REMOTE_USER_HEADER=x-auth-user
```

Optional fuer Installationen hinter einem Netzwerk-Proxy:

```env
HTTP_PROXY=http://proxy.firma.local:3128
HTTPS_PROXY=http://proxy.firma.local:3128
NO_PROXY=localhost,127.0.0.1,sqlserver,deb-srv-docker,MS-SRV-SQL
http_proxy=http://proxy.firma.local:3128
https_proxy=http://proxy.firma.local:3128
no_proxy=localhost,127.0.0.1,sqlserver,deb-srv-docker,MS-SRV-SQL
```

Hinweise:

- Die Proxy-Variablen werden beim Docker-Build an `npm install` und `npm run build` durchgereicht.
- Die gleichen Variablen werden auch an den laufenden `app`-Container weitergegeben.
- `NO_PROXY` bzw. `no_proxy` muss interne Ziele wie `sqlserver`, `localhost`, `127.0.0.1`, den Docker-Host und den externen SQL-Server enthalten.

## 3) Build und Start

```bash
npm run ops:update
```

Optional mit Git-Update vor dem Build:

```bash
npm run ops:update -- --pull
```

Ohne Datenbank-Backup:

```bash
npm run ops:update -- --skip-backup
```

## 3a) Docker hinter Netzwerk-Proxy

Wenn der Docker-Host selbst nur ueber einen Firmenproxy ins Internet kommt, reicht `.env` fuer den App-Build meist aus. Falls auch Docker selbst den Proxy kennen muss:

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf >/dev/null <<'EOF'
[Service]
Environment="HTTP_PROXY=http://proxy.firma.local:3128"
Environment="HTTPS_PROXY=http://proxy.firma.local:3128"
Environment="NO_PROXY=localhost,127.0.0.1,sqlserver,deb-srv-docker,MS-SRV-SQL"
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

Pruefen:

```bash
systemctl show --property=Environment docker
docker compose build app
```

Wenn der Proxy Authentifizierung verlangt, Benutzername/Passwort nur in der lokalen Server-Konfiguration oder in der lokalen `.env` hinterlegen, nie im Repository.

## 4) Health und Erreichbarkeit

```bash
curl -s http://localhost:3030/health
curl -s http://localhost:3030/api/health
```

Browser:

```text
http://deb-srv-docker:3030
```

## 5) Betriebsnotizen

- Migrationen laufen automatisch beim Containerstart.
- Start-Admin wird aus `ADMIN_USERNAME`/`ADMIN_PASSWORD` erstellt oder aktualisiert.
- `db-bootstrap` legt Datenbank, SQL-Login und DB-User bei Bedarf automatisch an.
- Bei SQL-Login-Fehlern (`ELOGIN`) zuerst SQL-Login/Passwort/Rechte auf `MS-SRV-SQL` pruefen.
- Uploads liegen persistent im Docker-Volume `uploads_data:/app/uploads`.
- SQL-Backups werden ueber `npm run ops:backup` nach `archive/backups/` geschrieben.
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
  - Fehlerlog
  - System
- Audit-Bereich mit Suche, Filtern und metadata_json-Detailansicht
- Fehlerlog im Admin-Bereich mit Zeit, Fehlercode, Meldung, Request-Pfad, Benutzer, Stacktrace und Metadaten
- Tabellen-Trennung:
  - `users` = Anwendungskonten
  - `visitors` = externe Besucher
  - `visits` = konkrete Besuchsvorgaenge
- Operativer Ablauf:
  - Voranmeldung -> Wache -> Check-in -> Druck -> Check-out mit Unterschrift -> Auditlog
- Wache kann Voranmeldedaten vor dem Check-in in der Detailansicht korrigieren oder ergaenzen.
- Oeffentliche Voranmeldungen enthalten eine Wache-Auswahl und werden direkt der gewaehlten Wache zugeordnet.
- Wache-Kalenderansicht in `/wache` zeigt Tages-/Monatsueberblick inkl. unzugeordneter Voranmeldungen.

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

## 5c) Check-out mit Besuchsnummer und Unterschrift

- Die Wache muss beim Check-out die Besuchsnummer vom zurueckgegebenen Besucherschein eingeben.
- Die Pruefung erfolgt serverseitig.
- Bei Abweichung wird der Check-out abgelehnt.
- Die Checkbox `Unterschrift vom Ansprechpartner erledigt` ist Pflicht.

Besuchsnummern:

- Neue Besuchsnummern haben genau 5 Zeichen.
- Erlaubte Zeichen: `A-Z` und `0-9`.

## 5e) Keine Aufbewahrungssteuerung in der UI

- Die neue App loescht Besucher-, Besuchs- und Auditdaten nicht physisch.
- Im Admin-System gibt es keine Aufbewahrungs-/Archivierungssteuerung mehr.
- Datenpflege ausserhalb der App erfolgt bei Bedarf administrativ direkt in SQL.

Alle neuen App-Daten bleiben ohne physische Loeschung erhalten; Aenderungen und Check-out-Aktionen werden im Auditlog protokolliert.

Erweiterte Unterschriftsstatus bleiben fuer Auswertung erhalten, sind aber nicht Teil der vereinfachten Standard-Check-out-Maske in der Wache.

## 5d) Operativen MVP-Ablauf pruefen

Das Hilfsskript verwendet nur Python-Standardbibliothek und spricht gegen die laufende App:

```bash
npm run verify:mvp
```

Es prueft:

- Voranmeldung
- Wache-Sichtbarkeit
- Guard-Bearbeitung
- Check-in
- Druck-Audit
- Check-out mit Unterschriftsstatus
- SiBe-Nachvollziehbarkeit
- Admin-Auditlog

Fuer die Rollen- und Zugriffssicherheit:

```bash
npm run verify:roles
```

Fuer einen CSV-Export unterschriftsrelevanter Besuche:

```bash
npm run report:signatures > unterschriften.csv
```

Fuer einen Sammellauf aller operativen Kernpruefungen:

```bash
npm run verify:ops
```

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
  - `error_logs`
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
