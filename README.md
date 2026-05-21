# Besucher_Manager

Interne Besucherverwaltung als JavaScript-/TypeScript-Anwendung fuer Mitarbeiter, Wache und Administration.

Der bisherige Django-Stand ist nicht mehr die aktive Zielarchitektur. Er liegt nur noch als fachliche Referenz unter [archive/django-prototype/README.md](/C:/Users/General_Rothenburger/Nextcloud_wiweb/Besucher_Manager/archive/django-prototype/README.md).

## Aktive Zielstruktur

```text
Besucher_Manager/
├── apps/
│   ├── backend/    # Express + TypeScript API
│   └── frontend/   # React + Vite Oberflaeche
├── archive/        # archivierter Django-Prototyp
├── uploads/        # persistente Uploads, z. B. Gelaendeplan
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── README.md
└── DEPLOYMENT.md
```

## Enthalten im aktuellen Stand

- Workspace-basierte Monorepo-Struktur fuer Backend und Frontend
- Express-API mit Healthcheck, Wachenliste und Voranmeldung ohne Login
- React/Vite-Oberflaeche fuer die interne Voranmeldung
- MSSQL-Konfigurationsschicht per Umgebungsvariablen
- SQL-Migrationsgeruest mit initialem Datenmodell
- einfacher CSRF- und Rate-Limit-Schutz fuer die oeffentliche interne Voranmeldung
- Docker-Build fuer einen internen App-Container ohne Reverse Proxy
- `.env.example` und aktualisierte Betriebsdokumentation

## Technischer Schnitt

- Node.js 22 LTS
- TypeScript
- Express
- React mit Vite
- externer Microsoft SQL Server
- Docker Compose

## Lokale Entwicklung

Voraussetzungen:

- Node.js 22
- npm 10
- Docker und Docker Compose fuer Container-Tests

Start:

```bash
cp .env.example .env
# fuer lokale Entwicklung die Platzhalter auf localhost anpassen
npm install
npm run migrate
npm run dev:backend
npm run dev:frontend
```

Standardports:

- Backend: `http://localhost:3020`
- Frontend: `http://localhost:5173`

## Docker-Betrieb

Ziel fuer die Testumgebung:

- Docker-Server: `deb-srv-docker`
- SQL-Server: `MS-SRV-SQL`
- Datenbank: `Besuchermngmt`
- Datenbankbenutzer: `dockerBesuchermngmt`

Wichtig:

- auf `deb-srv-docker` ist kein lokales `node` oder `npm` erforderlich
- es wird auf dem Server kein manuelles `npm install` ausgefuehrt
- alle Abhaengigkeiten werden nur im Docker-Build installiert
- die echte `.env` bleibt lokal auf dem Server und wird nicht committed
- Deployment erfolgt ueber `docker compose build --no-cache` und `docker compose up -d`

Start auf dem Docker-Server:

```bash
cd /opt/Besucher_Manager
docker compose build --no-cache
docker compose up -d
docker compose logs -f app
```

Der Container stellt die API und die gebaute Frontend-Anwendung ueber denselben Port bereit. Uploads werden in das Volume `uploads_data` geschrieben.

## Datenbank und Migrationen

Die Anwendung erwartet einen externen Microsoft SQL Server. Konfiguration erfolgt ausschliesslich ueber Umgebungsvariablen.

Migration ausfuehren im Container:

```bash
docker compose exec app npm run migrate --workspace @besucher-manager/backend
```

Die initiale SQL-Struktur liegt unter [apps/backend/migrations/001_initial.sql](/C:/Users/General_Rothenburger/Nextcloud_wiweb/Besucher_Manager/apps/backend/migrations/001_initial.sql).

## Naechste fachliche Schritte

1. Login, Session-Handling und Rollenpruefung fuer Wache und Admin implementieren
2. Wache-Panel mit Tagesuebersicht, Suche und Statusfiltern an MSSQL anbinden
3. Check-in, Check-out und direkte Besuchsanlage fuer die Pforte implementieren
4. Druckansicht fuer den Besucherschein mit Karte und Hinweistexten umsetzen
5. Admin-Bereich fuer Wachen, Texte, Karte und Benutzer ausbauen

## Hinweis zum Arbeitsstand

In dieser lokalen Umgebung waren `node`, `npm` und `docker` nicht installiert. Die Umstellung wurde daher dateibasiert vorgenommen und nicht ausgefuehrt.
