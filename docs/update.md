# Update-Anleitung

Diese Anleitung beschreibt den sicheren Update-Ablauf fuer den produktiven `Besucher_Manager` auf Docker-Basis.

## Ziel

- Anwendung auf den neuesten Git-Stand bringen
- Datenbank und Uploads erhalten
- Konfiguration in `.env` und `config/` beibehalten
- App nach dem Update direkt pruefen

## Voraussetzungen

- Repository liegt bereits auf dem Server, z. B. unter `/opt/Besucher_Manager`
- Docker und Docker Compose laufen
- `.env` ist bereits korrekt eingerichtet
- optionale Zusatzdateien wie `config/mail-relay.yml` sind vorhanden

## Wichtige Regeln

- Keine Volumes loeschen
- Kein `docker compose down -v`
- Keine `.env` aus Git ueberschreiben
- Vor jedem Update ein Backup erstellen

## Standard-Update

```bash
cd /opt/Besucher_Manager
git pull origin master
npm run ops:update
```

Das Script `npm run ops:update` fuehrt standardmaessig diese Schritte aus:

- optionales Git-Update, falls zusaetzlich genutzt
- SQL-Backup erstellen
- App neu bauen
- Container neu starten

## Manueller Update-Ablauf

Wenn du den Ablauf selbst einzeln steuern willst:

```bash
cd /opt/Besucher_Manager
git pull origin master
npm run ops:backup
docker build -t besucher_manager-app:latest .
docker compose up -d --force-recreate app
docker compose ps
```

## Update mit lokalem SQL-Compose-Service

Wenn die Anwendung zusammen mit dem lokalen MSSQL-Container betrieben wird:

```bash
cd /opt/Besucher_Manager
git pull origin master
npm run ops:backup
docker compose --profile local-db up -d --build
docker compose --profile local-db ps
```

## Update hinter Firmenproxy

Wenn der Server nur ueber einen Outbound-Proxy nach aussen kommt:

1. Proxy-Werte in `.env` pruefen:

```env
HTTP_PROXY=http://proxy.firma.local:3128
HTTPS_PROXY=http://proxy.firma.local:3128
NO_PROXY=localhost,127.0.0.1,sqlserver,deb-srv-docker
http_proxy=http://proxy.firma.local:3128
https_proxy=http://proxy.firma.local:3128
no_proxy=localhost,127.0.0.1,sqlserver,deb-srv-docker
```

2. Danach normal updaten:

```bash
cd /opt/Besucher_Manager
git pull origin master
npm run ops:update
```

## Was erhalten bleibt

Solange die Volumes nicht geloescht werden, bleiben erhalten:

- SQL-Datenbank
- Uploads
- Gelaendeplaene
- Hintergruende
- importierte Dateien in persistenten Speicherbereichen

## Pruefung nach dem Update

### Containerstatus

```bash
cd /opt/Besucher_Manager
docker compose ps
docker compose logs --tail=100 app
```

### Health-Check

```bash
curl -s http://127.0.0.1:3030/health
curl -s http://127.0.0.1:3030/api/health
```

Erwartet wird jeweils ein `ok`-Status.

### Fachliche Kurzpruefung

Nach dem Update im Browser pruefen:

- Login funktioniert
- Wache laedt
- SiBe laedt
- KasKdt laedt
- Admin laedt
- Voranmeldung funktioniert
- Druckansicht oeffnet
- Importseite laedt

## Wenn das Update fehlschlaegt

### App startet nicht

```bash
cd /opt/Besucher_Manager
docker compose logs -f app
```

Pruefen:

- `.env` vollstaendig
- SQL-Zugang korrekt
- Proxy korrekt
- Docker kann Images und Pakete laden

### Git-Konflikte oder lokale Aenderungen

Vor `git pull` pruefen:

```bash
git status
```

Wenn lokale Anpassungen auf dem Server liegen, erst sichern oder committen.

### Rollback

Wenn ein Update sofort zurueckgenommen werden muss:

1. Auf den vorherigen Commit wechseln
2. App erneut bauen
3. Container neu starten

Beispiel:

```bash
cd /opt/Besucher_Manager
git log --oneline -5
git checkout <alter-commit>
docker build -t besucher_manager-app:latest .
docker compose up -d --force-recreate app
```

Danach spaeter wieder sauber auf `master` zurueckgehen.

## Empfehlung fuer den Betrieb

Fuer produktive Updates hat sich dieser Ablauf bewaehrt:

```bash
cd /opt/Besucher_Manager
git pull origin master
npm run ops:update
docker compose ps
curl -s http://127.0.0.1:3030/health
```
