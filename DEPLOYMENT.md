# Deployment-Anleitung

Diese Anleitung beschreibt den Betrieb der internen Besucherverwaltung auf `deb-srv-docker` per Docker Compose mit externer Microsoft-SQL-Server-Datenbank auf `MS-SRV-SQL`.

## 1. Zielbild

Die Testumgebung besteht aktuell aus einem aktiven Container:

- `web`: Django-Anwendung mit Gunicorn

Standardport im aktuellen Testsetup:

- `3020` extern direkt auf `web`

## 2. Voraussetzungen

Auf dem Zielserver sollten installiert sein:

- Docker Engine
- Docker Compose Plugin
- Git

Nicht noetig auf dem Server:

- kein lokales Python
- kein lokales `pip`
- keine manuelle Installation aus `requirements.txt`

Zielannahmen in diesem Repository:

- Docker-Host: `deb-srv-docker`
- Webport: `3020`
- SQL-Host: `MS-SRV-SQL`
- Datenbank-Name: `Besuchermngmt`
- Datenbank-Benutzer: `dockerBesuchermngmt`

## 3. Verzeichnis auf dem Server anlegen

Auf `deb-srv-docker`:

```bash
sudo mkdir -p /opt/visitor-manager
sudo chown -R $USER:$USER /opt/visitor-manager
cd /opt/visitor-manager
```

Repository klonen:

```bash
git clone https://github.com/linuxlearner-germany/Besucher_Manager.git .
```

## 4. Vorbelegte Konfiguration

Das Repository ist so vorbelegt, dass `docker compose up -d --build` direkt auf den Zielhost und den Zielport zeigt.

Die Container-Konfiguration wird direkt aus der versionierten Datei [.env](C:/Users/General_Rothenburger/Nextcloud_wiweb/Besucher_Manager/.env) geladen.

Vorbelegte Werte:

```env
DJANGO_SECRET_KEY=visitor-manager-internal-secret-change-this
DJANGO_DEBUG=False
DJANGO_SECURE_COOKIES=False
DJANGO_ALLOWED_HOSTS=deb-srv-docker,localhost,127.0.0.1
DJANGO_CSRF_TRUSTED_ORIGINS=http://deb-srv-docker:3020,http://localhost:3020,http://127.0.0.1:3020

DATABASE_ENGINE=mssql
DATABASE_NAME=Besuchermngmt
DATABASE_USER=dockerBesuchermngmt
DATABASE_PASSWORD=V&9Hzx5YunRpFYXn@mT
DATABASE_HOST=MS-SRV-SQL
DATABASE_PORT=1433
DATABASE_OPTIONS=TrustServerCertificate=yes
MSSQL_ODBC_DRIVER=ODBC Driver 18 for SQL Server
DATABASE_CONNECT_RETRIES=30
DATABASE_CONNECT_SLEEP_SECONDS=5

VISITOR_RETENTION_DAYS=90
PUBLIC_FORM_RATE_LIMIT=10
PUBLIC_FORM_RATE_WINDOW_SECONDS=900
```

Hinweise:

- Fuer echten Produktivbetrieb sollte `DJANGO_SECRET_KEY` ersetzt werden.
- Wenn die Datenbank anders heisst, muss `DATABASE_NAME` angepasst werden.
- Wenn TLS vor dem Container terminiert wird, muessen die CSRF-Origins auf `https://...` umgestellt werden.
- Sobald HTTPS aktiv ist, sollte `DJANGO_SECURE_COOKIES=True` gesetzt werden.

## 5. Teststart ohne Proxy

Der direkte Teststart ist absichtlich so einfach wie moeglich gehalten:

```bash
docker compose up -d --build
```

Danach ist die Anwendung direkt erreichbar unter:

- `http://deb-srv-docker:3020/`

Der Container versucht beim Start:

1. SQL Server zu erreichen
2. die Datenbank `Besuchermngmt` bei Bedarf anzulegen
3. Migrationen auszufuehren
4. statische Dateien zu sammeln
5. Gunicorn zu starten

## 6. Netzwerk-Security-Proxy spaeter

Im Repository ist bewusst kein Reverse-Proxy-Container enthalten.

Wenn spaeter ein Netzwerk-Security-Proxy, eine interne WAF oder eine zentrale Sicherheitskomponente vor `deb-srv-docker` geschaltet wird, sind fuer die Anwendung nur diese Punkte relevant:

1. externer Hostname in `DJANGO_ALLOWED_HOSTS`
2. echte Origin in `DJANGO_CSRF_TRUSTED_ORIGINS`
3. bei HTTPS `DJANGO_SECURE_COOKIES=True`
4. falls TLS ausserhalb des Containers terminiert wird, muss `X-Forwarded-Proto: https` sauber gesetzt werden

## 7. Container bauen und starten

Im Projektverzeichnis:

```bash
docker compose up -d --build
```

Status pruefen:

```bash
docker compose ps
```

Logs pruefen:

```bash
docker compose logs -f web
```

## 8. Datenbankmigrationen und Admin-Benutzer

Im aktuellen Dockerfile werden Migrationen beim Start ausgefuehrt. Fuer den ersten produktiven Start sollte trotzdem explizit geprueft werden:

```bash
docker compose exec web python manage.py migrate
```

Admin-Benutzer anlegen:

```bash
docker compose exec web python manage.py createsuperuser
```

## 9. Erste Grunddaten pflegen

Nach dem ersten Login im Admin-Bereich:

1. Wachen / Eingaenge anlegen
2. Benutzer fuer Pforte/Wache anlegen
3. Den Benutzern Rollenprofile und Default-Wache zuweisen
4. Gelaendeplan hochladen und `is_active` setzen
5. Texte fuer Sicherheitshinweise, Fotografierverbot und Besucherregeln pflegen
6. Optional `SystemSetting` fuer `retention_days` setzen

## 10. Erreichbarkeit pruefen

Danach mindestens diese URLs testen:

- `/`
- `/accounts/login/`
- `/admin/`

Fachlicher Kurztest:

1. Oeffentliche Voranmeldung absenden
2. Mit Wachen-Benutzer anmelden
3. Voranmeldung in der Tagesuebersicht finden
4. Besuch einchecken
5. Besucherschein drucken
6. Besuch auschecken

## 11. Backup-Konzept

Die Anwendung nutzt eine externe SQL-Server-Datenbank. Das Backup muss daher auf `MS-SRV-SQL` fuer die Datenbank `Besuchermngmt` organisiert werden.

Mindestens sichern:

- Datenbank `Besuchermngmt` auf `MS-SRV-SQL`
- Docker-Volume `media_data`
- versionierte Sicherung der `.env`

## 12. Aufbewahrungsroutine einrichten

Die Anwendung bringt einen Command fuer alte Besuchsdaten mit.

Loeschen:

```bash
docker compose exec web python manage.py purge_old_visits
```

Anonymisieren:

```bash
docker compose exec web python manage.py purge_old_visits --anonymize
```

Empfehlung:

- taegliche Ausfuehrung per Cronjob oder Systemd Timer

Beispiel fuer Cron:

```bash
0 2 * * * cd /opt/visitor-manager && docker compose exec -T web python manage.py purge_old_visits
```

## 13. Updates einspielen

Beispielablauf:

```bash
cd /opt/visitor-manager
git pull
docker compose up -d --build
docker compose exec web python manage.py migrate
docker compose exec web python manage.py collectstatic --noinput
```

Danach kurz pruefen:

- Container laufen
- Login funktioniert
- Tagesuebersicht ist erreichbar

## 14. Betrieb und Sicherheit

Empfohlene Mindestmassnahmen:

- Server nur intern oder per VPN erreichbar machen
- SSH nur fuer berechtigte Administratoren
- starke Passwoerter fuer Django-Admin und Datenbank
- Docker-Images regelmaessig aktualisieren
- regelmaessige Restore-Tests fuer SQL-Server-Backups
- Dependency-Scan im Build-Prozess, z. B. mit Trivy
- Monitoring fuer Container-Status, Plattenplatz und Datenbankvolumen

## 15. Typische Fehlerbilder

### `DisallowedHost`

Ursache:

- Hostname fehlt in `DJANGO_ALLOWED_HOSTS`

Loesung:

- `.env` anpassen und Container neu starten

### CSRF-Fehler beim Login oder Formular

Ursache:

- `DJANGO_CSRF_TRUSTED_ORIGINS` passt nicht zur echten URL

Loesung:

- korrekte `https://...`-Origin eintragen und Container neu starten

### Statische Dateien fehlen

Ursache:

- `collectstatic` wurde nicht ausgefuehrt oder Volumes sind inkonsistent

Loesung:

```bash
docker compose exec web python manage.py collectstatic --noinput
docker compose up -d
```

### Anwendung startet, aber Login funktioniert nicht

Ursache:

- kein Benutzer angelegt
- Rollenprofil oder Default-Wache fehlt

Loesung:

- Benutzer im Admin anlegen
- `StaffProfile` und `default_gate` setzen

## 16. Empfohlene naechste technische Schritte

- separates `compose.prod.yml` fuer Produktionswerte anlegen
- Healthchecks fuer `web` erweitern
- Seed-Command fuer Wachen und Standardtexte schreiben
- PDF-Erzeugung spaeter mit WeasyPrint ergaenzen
- Backup und Retention in den Betriebsprozess aufnehmen

