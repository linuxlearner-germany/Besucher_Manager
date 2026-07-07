# Deployment hinter Internet Security Proxy

Diese Anleitung bereitet den Besucher Manager fuer den Betrieb hinter einem Internet Security Proxy vor. Die Anwendung selbst bleibt per Docker Compose lokal auf Port `3030` erreichbar. Die oeffentliche HTTPS-Domain wird ueber `PUBLIC_BASE_URL` konfiguriert.

Wichtig:

- Der Proxy hat nur Hostname und Port.
- Es gibt keine Proxy-Authentifizierung.
- Der produktive MSSQL-Server laeuft extern auf einem anderen System.
- Der MSSQL-Host darf nicht ueber den Proxy laufen und muss in `NO_PROXY` stehen.

## 1. `.env` anlegen

```bash
cp .env.example .env
nano .env
```

Beispiel fuer einen Betrieb mit externer Datenbank und HTTPS-URL:

```env
NODE_ENV=production
APP_HOST=0.0.0.0
PORT=3030

PUBLIC_BASE_URL=https://besucher.example.local
APP_SECURE_COOKIES=true
APP_TRUST_PROXY=false

HTTP_PROXY=http://proxy.example.local:3128
HTTPS_PROXY=http://proxy.example.local:3128
NO_PROXY=localhost,127.0.0.1,::1,sqlserver,db-bootstrap,app,mssql-server.local,192.168.10.20,*.local,.local,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12
http_proxy=http://proxy.example.local:3128
https_proxy=http://proxy.example.local:3128
no_proxy=localhost,127.0.0.1,::1,sqlserver,db-bootstrap,app,mssql-server.local,192.168.10.20,*.local,.local,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12

MSSQL_HOST=mssql-server.local
MSSQL_PORT=1433
MSSQL_DATABASE=BesucherManager
MSSQL_USER=besucher_app
MSSQL_PASSWORD=change-me
MSSQL_ENCRYPT=false
MSSQL_TRUST_SERVER_CERTIFICATE=true
```

Hinweise:

- `PUBLIC_BASE_URL` ist die oeffentliche HTTPS-URL der Anwendung.
- `APP_SECURE_COOKIES=true` ist fuer HTTPS-Betrieb richtig.
- `APP_TRUST_PROXY=false` bleibt korrekt, solange kein Reverse Proxy vor der Anwendung ausgewertet werden muss.
- `MSSQL_HOST` und die MSSQL-IP gehoeren in `NO_PROXY`.

## 2. Docker Compose bauen und starten

Der produktive Betrieb mit externer MSSQL-Datenbank nutzt nur den App-Container. Die im Repository vorhandenen lokalen SQL-Container sind optional und in das Compose-Profil `local-db` verschoben.

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f app
```

Fuer rein lokale Tests mit der im Compose enthaltenen MSSQL-Instanz kann optional das Profil `local-db` aktiviert werden:

```bash
docker compose --profile local-db up -d
```

## 3. Proxy im Container pruefen

```bash
docker compose exec app env | grep -i proxy
docker compose exec app node -e "console.log(process.env.HTTP_PROXY || process.env.http_proxy)"
```

## 4. Externen MSSQL-Server pruefen

Vom Docker-Host aus:

```bash
nc -vz mssql-server.local 1433
```

Falls `nc` fehlt:

```bash
sudo apt update
sudo apt install netcat-openbsd -y
```

Wichtig:

- Die Datenbank muss direkt im internen Netz erreichbar sein.
- Der MSSQL-Host darf nicht ueber den Internet Security Proxy geleitet werden.

## 5. Anwendung pruefen

```bash
curl https://besucher.example.local
curl https://besucher.example.local/health
curl https://besucher.example.local/api/health
```

## 6. Typische Fehler

### Build laedt keine Pakete

Moegliche Ursachen:

- Proxy fehlt in den Build-Args.
- Proxy-Host oder Port ist falsch.
- Der Proxy ist vom Docker-Host nicht erreichbar.

### App erreicht externen MSSQL nicht

Moegliche Ursachen:

- `MSSQL_HOST` oder die MSSQL-IP fehlt in `NO_PROXY`.
- Firewall blockiert Port `1433`.
- SQL Server hat TCP/IP nicht aktiviert.
- Die DNS-Aufloesung im Container funktioniert nicht.
- `MSSQL_HOST` oder `MSSQL_PORT` ist falsch.

### Login oder Session funktioniert nicht

Moegliche Ursachen:

- `APP_SECURE_COOKIES=true`, aber der Zugriff erfolgt nicht ueber HTTPS.
- `PUBLIC_BASE_URL` ist falsch.
- Cookies werden wegen einer unpassenden URL nicht korrekt gesetzt.

### HTTPS-URL funktioniert nicht korrekt

Moegliche Ursachen:

- `PUBLIC_BASE_URL` ist falsch gesetzt.
- Die Anwendung wird nicht ueber die erwartete Domain aufgerufen.
- Portfreigabe oder Routing zur Anwendung fehlt.

## 7. Sicherheitsregeln

- `.env` nicht committen.
- Keine echten Passwoerter in Beispieldateien speichern.
- Keine produktiven Hostnamen hart im Repository hinterlegen.
- Auch ohne Proxy-Authentifizierung keine vertraulichen Werte in Logs schreiben.
- MSSQL nicht ueber den Internet Security Proxy leiten.
- Produktiv eine HTTPS-URL in `PUBLIC_BASE_URL` verwenden.
- Bei HTTPS `APP_SECURE_COOKIES=true` setzen.
