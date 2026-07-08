# Deployment hinter Internet Security Proxy

Diese Anleitung beschreibt den Betrieb des Besucher Managers mit einem Internet Security Proxy für ausgehende Verbindungen. Die Anwendung selbst läuft per Docker Compose lokal auf Port `3030`.

Diese Anleitung ist für folgenden Aufbau gedacht:

- Die App läuft als Docker-Container auf einem internen Host.
- Ausgehender Internetzugriff läuft über einen Security- oder Firmen-Proxy.
- Die Datenbank läuft entweder extern auf einem eigenen MSSQL-Server oder lokal über das Compose-Profil `local-db`.
- Interne Ziele wie MSSQL oder lokale Hostnamen dürfen nicht über den Internet-Proxy laufen.

## 1. Voraussetzungen

- Docker und Docker Compose Plugin sind installiert.
- Das Repository liegt lokal auf dem Zielsystem.
- Für den Produktivbetrieb existiert eine eigene `.env`.

Repository vorbereiten:

```bash
cd /opt
git clone https://github.com/linuxlearner-germany/Besucher_Manager.git
cd Besucher_Manager
cp .env.example .env
```

## 2. `.env` für Proxy-Betrieb pflegen

```bash
nano .env
```

Beispiel für Betrieb mit externer MSSQL-Datenbank:

```env
NODE_ENV=production
APP_HOST=0.0.0.0
PORT=3030

PUBLIC_BASE_URL=http://deb-srv-docker:3030
APP_SECURE_COOKIES=false
APP_SECRET=CHANGE_ME

HTTP_PROXY=http://proxy.example.local:3128
HTTPS_PROXY=http://proxy.example.local:3128
NO_PROXY=localhost,127.0.0.1,::1,sqlserver,db-bootstrap,app,mssql-server.local,192.168.10.20,deb-srv-docker,besucher.example.local
http_proxy=http://proxy.example.local:3128
https_proxy=http://proxy.example.local:3128
no_proxy=localhost,127.0.0.1,::1,sqlserver,db-bootstrap,app,mssql-server.local,192.168.10.20,deb-srv-docker,besucher.example.local

MSSQL_HOST=mssql-server.local
MSSQL_PORT=1433
MSSQL_DATABASE=BesucherManager
MSSQL_USER=besucher_app
MSSQL_PASSWORD=CHANGE_ME
MSSQL_ENCRYPT=false
MSSQL_TRUST_SERVER_CERTIFICATE=true

UPLOAD_DIR=/app/uploads
MAIL_RELAY_CONFIG_PATH=/app/config/mail-relay.yml

ADMIN_USERNAME=admin
ADMIN_PASSWORD=CHANGE_ME
```

Wichtig:

- `PUBLIC_BASE_URL` muss zur tatsächlichen Aufrufadresse passen.
- `APP_SECRET` muss produktiv gesetzt werden und geheim bleiben.
- `MSSQL_HOST` und interne IPs oder Hostnamen müssen in `NO_PROXY` und `no_proxy` stehen.

## 3. Proxy-Verhalten richtig verstehen

Der Internet Security Proxy ist nur für ausgehende Verbindungen nach außen gedacht, zum Beispiel:

- Paketdownloads beim Docker-Build
- SMTP-Ziele außerhalb des lokalen Netzes
- externe Abhängigkeiten während Build oder Runtime

Nicht über den Proxy laufen dürfen:

- MSSQL
- lokale Docker-Service-Namen wie `sqlserver`
- `localhost` und interne Hostnamen

Wenn interne Ziele über den Proxy geleitet werden, sind Login-, Datenbank- oder Mailprobleme sehr wahrscheinlich.

## 4. Container mit externer MSSQL-Datenbank starten

Wenn MSSQL extern betrieben wird, wird nur der App-Container benötigt:

```bash
docker compose build app
docker compose up -d app
docker compose ps
docker compose logs -f app
```

Die Anwendung ist dann lokal auf dem Host unter Port `3030` erreichbar.

## 5. Optional: lokales MSSQL-Profil verwenden

Für lokale Tests oder eine vollständig lokale Installation kann stattdessen das Compose-Profil `local-db` verwendet werden:

```bash
docker compose --profile local-db up -d --build
docker compose --profile local-db ps
```

Dabei werden diese Container verwendet:

- `sqlserver`
- `db-bootstrap`
- `app`

Wichtig:

- Die SQL-Daten liegen im Docker-Volume `sqlserver_data`.
- Uploads liegen im Docker-Volume `uploads_data`.
- Kein `docker compose down -v`, wenn Daten erhalten bleiben sollen.

## 6. Verhalten des Start-Admins

Die Anwendung liest `ADMIN_USERNAME` und `ADMIN_PASSWORD` aus der `.env`.

Aktuelles Verhalten:

- Existiert der Start-Admin noch nicht, wird er beim Start angelegt.
- Existiert der Benutzer bereits, werden vorhandene Zugangsdaten und Profildaten nicht mehr überschrieben.

Das ist wichtig für den laufenden Betrieb:

- Passwortänderungen im Admin-Bereich bleiben bei Neustarts erhalten.
- Benutzerbearbeitung wird nicht mehr durch den Containerstart zurückgesetzt.

Wenn ein Admin-Passwort bewusst neu gesetzt werden soll, muss das gezielt über die Anwendung oder per Wartungsschritt erfolgen, nicht allein über einen Neustart.

## 7. Proxy im Container prüfen

```bash
docker compose exec app env | grep -i proxy
docker compose exec app node -e "console.log(process.env.HTTP_PROXY || process.env.http_proxy || 'kein proxy gesetzt')"
```

Wenn MSSQL extern ist, zusätzlich prüfen, dass der MSSQL-Host nicht über den Proxy läuft.

## 8. Erreichbarkeit und Health prüfen

Lokal auf dem Host:

```bash
curl -s http://127.0.0.1:3030/health
docker compose ps
```

Die aktuelle Health-Route ist:

- `/health`

## 9. Externen MSSQL-Server prüfen

Vom Docker-Host aus:

```bash
nc -vz mssql-server.local 1433
```

Falls `nc` fehlt:

```bash
sudo apt update
sudo apt install netcat-openbsd -y
```

Zusätzlich sinnvoll:

```bash
docker compose exec app getent hosts mssql-server.local
```

## 10. Update und Neuaufbau

Empfohlenes Update ohne Datenverlust:

```bash
cd /opt/Besucher_Manager
git pull origin master
docker compose build app
docker compose up -d app
docker compose ps
```

Mit lokalem SQL-Profil:

```bash
cd /opt/Besucher_Manager
git pull origin master
docker compose --profile local-db up -d --build
docker compose --profile local-db ps
```

Wichtig:

- Upload- und SQL-Volumes bleiben erhalten, solange keine Volumes gelöscht werden.
- Migrationen laufen automatisch beim App-Start.

## 11. Typische Fehlerbilder

### Build oder `npm install` im Docker-Build schlägt fehl

Mögliche Ursachen:

- Proxy fehlt oder ist falsch gesetzt.
- Docker-Daemon hat selbst keinen Internetzugriff.
- Proxy-Host oder Port ist falsch.

### App erreicht externen MSSQL-Server nicht

Mögliche Ursachen:

- MSSQL-Host fehlt in `NO_PROXY`.
- Firewall blockiert Port `1433`.
- DNS-Auflösung im Container funktioniert nicht.
- `MSSQL_HOST`, `MSSQL_PORT` oder TLS-Einstellungen sind falsch.

### Login oder Session funktioniert nicht

Mögliche Ursachen:

- `PUBLIC_BASE_URL` passt nicht zur echten Benutzer-URL.
- Cookies oder Browserdaten stammen noch von einer alten Konfiguration.

### Nach Neustart sind Admin-Änderungen weg

Das sollte mit dem aktuellen Stand nicht mehr auftreten.

Prüfen:

- ob wirklich der aktuelle Containerstand läuft
- ob nicht ein alter Image-Stand gestartet wurde
- ob mehrere Instanzen mit unterschiedlicher `.env` existieren

## 13. Sicherheitsregeln

- `.env` niemals committen
- keine echten Passwörter in Dokumentation oder Beispieldateien speichern
- `APP_SECRET` produktiv immer individuell setzen
- MSSQL nicht über den Internet Security Proxy leiten
- Logs nicht mit Zugangsdaten oder Proxy-Credentials füllen
