# Deployment

Diese Anleitung beschreibt den Betrieb der TypeScript-Anwendung per Docker Compose mit externer Microsoft-SQL-Server-Datenbank.

## 1. Zielbild

Ein einzelner Container liefert:

- Express-API
- gebaute React-Oberflaeche
- Healthcheck unter `/health`

Der SQL Server bleibt extern. Ein Reverse Proxy ist nicht Bestandteil des MVP.

## 2. Voraussetzungen

Auf dem Zielserver:

- Docker Engine
- Docker Compose Plugin
- Git

Fuer Build und Laufzeit sind lokal keine Python-Komponenten noetig.

## 3. Verzeichnis vorbereiten

```bash
sudo mkdir -p /opt/visitor-manager
sudo chown -R $USER:$USER /opt/visitor-manager
cd /opt/visitor-manager
git clone https://github.com/linuxlearner-germany/Besucher_Manager.git .
cp .env.example .env
```

## 4. Konfiguration

Pflichtvariablen in `.env`:

```env
NODE_ENV=production
APP_HOST=0.0.0.0
APP_PORT=3020
APP_SECRET=change-this-secret
PUBLIC_BASE_URL=http://deb-srv-docker:3020
APP_SECURE_COOKIES=false

MSSQL_HOST=MS-SRV-SQL
MSSQL_PORT=1433
MSSQL_DATABASE=Besuchermngmt
MSSQL_USER=dockerBesuchermngmt
MSSQL_PASSWORD=change-this-password
MSSQL_ENCRYPT=false
MSSQL_TRUST_SERVER_CERTIFICATE=true

UPLOAD_DIR=/app/uploads
VISITOR_RETENTION_DAYS=90
PUBLIC_FORM_RATE_LIMIT=10
PUBLIC_FORM_RATE_WINDOW_SECONDS=900
```

Hinweise:

- Zugangsdaten bleiben ausschliesslich in `.env`.
- Fuer interne HTTP-Tests kann `MSSQL_TRUST_SERVER_CERTIFICATE=true` erforderlich sein.
- `PUBLIC_BASE_URL` muss zur spaeteren internen URL passen.

## 5. Build und Start

```bash
docker compose up -d --build
```

Pruefen:

```bash
docker compose ps
docker compose logs -f app
```

Die Anwendung ist danach unter `http://<host>:3020/` erreichbar.

## 6. Migrationen

Die SQL-Migrationen liegen im Container unter `apps/backend/migrations`.

Vor dem ersten produktiven Einsatz:

```bash
docker compose exec app npm run migrate --workspace @besucher-manager/backend
```

## 7. Netzwerkfreigaben

Eingehend:

- Clients der Wache zur Webanwendung auf `APP_PORT`
- interne Mitarbeiter zur Startseite auf `APP_PORT`
- Administratoren zum Admin-Panel auf `APP_PORT`

Ausgehend:

- App-Container zu `MSSQL_HOST:MSSQL_PORT`

Optional spaeter:

- App-Container zu internem SMTP-Server

## 8. Reverse-Proxy-freier Betrieb

Die Anwendung ist fuer direkten internen Zugriff ausgelegt. Es gibt keine Abhaengigkeit von `X-Forwarded-*`-Headern.

Zu beachten:

- Bind-Adresse und Port kommen aus `APP_HOST` und `APP_PORT`
- Netzwerkzugriffe werden ueber Firewall oder Paketfilter begrenzt
- HTTPS kann bei Bedarf in einer separaten internen Komponente terminiert werden

## 9. Persistenz und Backups

Mindestens sichern:

- externe SQL-Server-Datenbank
- Docker-Volume `uploads_data`
- gesicherte Kopie der produktiven `.env`

## 10. Empfohlener Betriebscheck

Nach jedem Deployment:

1. `/health` pruefen
2. Login pruefen
3. Oeffentliche Voranmeldung pruefen
4. Tagesuebersicht pruefen
5. Druckansicht pruefen

## 11. Offene Betriebsarbeiten

- Restore-Test fuer SQL-Backups
- Trivy- oder vergleichbaren Dependency-Scan in die Pipeline aufnehmen
- produktionsnahe Session-Strategie und Secrets-Verwaltung festziehen
- Upload-Handling und Retention-Job produktiv anschliessen

