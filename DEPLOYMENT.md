# Deployment-Anleitung

Diese Anleitung beschreibt den produktionsnahen Betrieb der internen Besucherverwaltung auf einem Linux-Server per Docker Compose.

## 1. Zielbild

Die Anwendung besteht aus drei Containern:

- `web`: Django-Anwendung mit Gunicorn
- `db`: PostgreSQL
- `caddy`: Reverse Proxy fuer HTTP/HTTPS und Auslieferung von statischen Dateien

Standardport im aktuellen Setup:

- `8080` extern auf `caddy`

## 2. Voraussetzungen

Auf dem Zielserver sollten installiert sein:

- Docker Engine
- Docker Compose Plugin
- Git

Empfohlen:

- Debian 12 oder Ubuntu 24.04 LTS
- separater technischer Benutzer, z. B. `visitorapp`
- internes DNS oder feste IP
- Zugriff nur aus internem Netz oder per VPN

## 3. Verzeichnis auf dem Server anlegen

Beispiel:

```bash
sudo mkdir -p /opt/visitor-manager
sudo chown -R $USER:$USER /opt/visitor-manager
cd /opt/visitor-manager
```

Repository klonen:

```bash
git clone <REPOSITORY_URL> .
```

## 4. Umgebungsdatei vorbereiten

Die Datei `.env` im Projektverzeichnis anlegen:

```bash
cp .env.example .env
```

Empfohlene Mindestanpassungen:

```env
DJANGO_SECRET_KEY=<langer-zufaelliger-wert>
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=besucher.intern,127.0.0.1,localhost
DJANGO_CSRF_TRUSTED_ORIGINS=https://besucher.intern

POSTGRES_DB=visitor_manager
POSTGRES_USER=visitor_manager
POSTGRES_PASSWORD=<starkes-passwort>
POSTGRES_HOST=db
POSTGRES_PORT=5432

VISITOR_RETENTION_DAYS=90
PUBLIC_FORM_RATE_LIMIT=10
PUBLIC_FORM_RATE_WINDOW_SECONDS=900
```

Hinweise:

- `DJANGO_SECRET_KEY` darf nicht der Default bleiben.
- `POSTGRES_PASSWORD` muss produktionsgeeignet sein.
- `DJANGO_ALLOWED_HOSTS` und `DJANGO_CSRF_TRUSTED_ORIGINS` muessen zu eurem internen Hostnamen passen.

## 5. Reverse Proxy und HTTPS

Im Repository ist aktuell ein einfaches [infra/Caddyfile](/C:/Users/General_Rothenburger/Nextcloud_wiweb/Besucher_Manager/infra/Caddyfile) fuer internes HTTP enthalten.

Fuer produktiven Betrieb gibt es zwei uebliche Varianten:

1. TLS bereits vor dem Server, z. B. durch interne Firewall, Load Balancer oder Reverse Proxy
2. TLS direkt in Caddy mit internem Zertifikat

Wenn TLS vor dem Container terminiert wird, muss der Proxy `X-Forwarded-Proto: https` setzen.

Wenn Caddy selbst TLS machen soll, muss das Caddyfile entsprechend erweitert werden. Beispiel:

```caddy
besucher.intern {
    tls internal
    encode gzip

    handle /static/* {
        root * /srv
        file_server
    }

    handle /media/* {
        root * /srv
        file_server
    }

    reverse_proxy web:8000
}
```

Wichtig:

- Das interne Root-Zertifikat muss auf den Clients vertraut werden.
- Wenn ihr bereits eine zentrale interne PKI habt, solltet ihr diese bevorzugen.

## 6. Container bauen und starten

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
docker compose logs -f db
docker compose logs -f caddy
```

## 7. Datenbankmigrationen und Admin-Benutzer

Im aktuellen Dockerfile werden Migrationen beim Start ausgefuehrt. Fuer den ersten produktiven Start sollte trotzdem explizit geprueft werden:

```bash
docker compose exec web python manage.py migrate
```

Admin-Benutzer anlegen:

```bash
docker compose exec web python manage.py createsuperuser
```

## 8. Erste Grunddaten pflegen

Nach dem ersten Login im Admin-Bereich:

1. Wachen / Eingaenge anlegen
2. Benutzer fuer Pforte/Wache anlegen
3. Den Benutzern Rollenprofile und Default-Wache zuweisen
4. Gelaendeplan hochladen und `is_active` setzen
5. Texte fuer Sicherheitshinweise, Fotografierverbot und Besucherregeln pflegen
6. Optional `SystemSetting` fuer `retention_days` setzen

## 9. Erreichbarkeit pruefen

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

## 10. Backup-Konzept

Mindestens die PostgreSQL-Daten muessen gesichert werden.

### Datenbankdump

```bash
docker compose exec db pg_dump -U visitor_manager visitor_manager > backup_visitor_manager.sql
```

### Wiederherstellung

```bash
cat backup_visitor_manager.sql | docker compose exec -T db psql -U visitor_manager visitor_manager
```

Zusaetzlich sinnvoll:

- Sicherung des Verzeichnisses `media/` bzw. des Docker-Volumes `media_data`
- versionierte Sicherung der `.env`

## 11. Aufbewahrungsroutine einrichten

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

## 12. Updates einspielen

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

## 13. Betrieb und Sicherheit

Empfohlene Mindestmassnahmen:

- Server nur intern oder per VPN erreichbar machen
- SSH nur fuer berechtigte Administratoren
- starke Passwoerter fuer Django-Admin und Datenbank
- Docker-Images regelmaessig aktualisieren
- regelmaessige Restore-Tests fuer Backups
- Dependency-Scan im Build-Prozess, z. B. mit Trivy
- Monitoring fuer Container-Status, Plattenplatz und Datenbankvolumen

## 14. Typische Fehlerbilder

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

## 15. Empfohlene naechste technische Schritte

- separates `compose.prod.yml` fuer Produktionswerte anlegen
- Healthchecks fuer `web` und `caddy` erweitern
- Seed-Command fuer Wachen und Standardtexte schreiben
- PDF-Erzeugung spaeter mit WeasyPrint ergaenzen
- Backup und Retention in den Betriebsprozess aufnehmen

