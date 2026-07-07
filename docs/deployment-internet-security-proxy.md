# Deployment hinter Internet Security Proxy

Diese Anleitung beschreibt den produktiven Betrieb des Besucher Managers hinter einem Internet Security Proxy. Die Anwendung selbst läuft per Docker Compose lokal auf Port `3030`. Die öffentliche Adresse wird über `PUBLIC_BASE_URL` gesetzt.

Diese Anleitung ist für folgenden Aufbau gedacht:

- Die App läuft als Docker-Container auf einem internen Host.
- Ausgehender Internetzugriff läuft über einen Security- oder Firmen-Proxy.
- Die Datenbank läuft entweder extern auf einem eigenen MSSQL-Server oder lokal über das Compose-Profil `local-db`.
- Interne Ziele wie MSSQL, Reverse Proxy oder lokale Hostnamen dürfen nicht über den Internet-Proxy laufen.

## 1. Voraussetzungen

- Docker und Docker Compose Plugin sind installiert.
- Das Repository liegt lokal auf dem Zielsystem.
- Für den Produktivbetrieb existiert eine eigene `.env`.
- Für HTTPS gibt es einen vorgeschalteten Reverse Proxy, WAF oder Load Balancer.

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

Beispiel für Betrieb mit externer MSSQL-Datenbank und vorgeschaltetem HTTPS-Endpunkt:

```env
NODE_ENV=production
APP_HOST=0.0.0.0
PORT=3030

PUBLIC_BASE_URL=https://besucher.example.local
APP_SECURE_COOKIES=true
APP_TRUST_PROXY=true
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

- `PUBLIC_BASE_URL` muss die echte externe Benutzer-URL enthalten.
- `APP_SECURE_COOKIES=true` ist bei HTTPS Pflicht.
- `APP_TRUST_PROXY=true` ist nötig, wenn ein Reverse Proxy davor steht und Forwarded-Header gesetzt werden.
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
- der lokale Reverse Proxy
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

## 7. Reverse Proxy davor schalten

Empfohlener Aufbau:

- App bleibt intern auf `3030`
- Reverse Proxy terminiert HTTPS auf `443`
- Reverse Proxy leitet an `http://127.0.0.1:3030` weiter

Beispiel mit `nginx`:

```nginx
server {
    listen 80;
    server_name besucher.example.local;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name besucher.example.local;

    ssl_certificate     /etc/nginx/tls/besucher.example.local/fullchain.pem;
    ssl_certificate_key /etc/nginx/tls/besucher.example.local/privkey.pem;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

Dazu passend in `.env`:

- `PUBLIC_BASE_URL=https://besucher.example.local`
- `APP_SECURE_COOKIES=true`
- `APP_TRUST_PROXY=true`

## 8. Proxy im Container prüfen

```bash
docker compose exec app env | grep -i proxy
docker compose exec app node -e "console.log(process.env.HTTP_PROXY || process.env.http_proxy || 'kein proxy gesetzt')"
```

Wenn MSSQL extern ist, zusätzlich prüfen, dass der MSSQL-Host nicht über den Proxy läuft.

## 9. Erreichbarkeit und Health prüfen

Lokal auf dem Host:

```bash
curl -s http://127.0.0.1:3030/health
docker compose ps
```

Über die externe URL:

```bash
curl -Ik https://besucher.example.local
curl -s https://besucher.example.local/health
```

Die aktuelle Health-Route ist:

- `/health`

## 10. Externen MSSQL-Server prüfen

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

## 11. Update und Neuaufbau

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

## 12. Typische Fehlerbilder

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

- `APP_SECURE_COOKIES=true`, aber die App wird per HTTP statt HTTPS aufgerufen.
- `PUBLIC_BASE_URL` passt nicht zur echten Benutzer-URL.
- Reverse Proxy setzt Header nicht korrekt weiter.

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
- Port `3030` nach außen sperren, wenn der Zugriff nur über den Reverse Proxy erfolgen soll
- nur HTTPS produktiv freigeben
- Logs nicht mit Zugangsdaten oder Proxy-Credentials füllen
