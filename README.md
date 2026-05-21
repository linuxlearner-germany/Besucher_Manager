# Interne Besucherverwaltung

Kleines Django-MVP fuer die interne Besucherverwaltung an Pforte und Wache.

## Enthalten im aktuellen Stand

- Django-Projekt mit Login, Admin und Rollenprofil fuer Wache/Admin
- Docker-Grundgeruest mit direktem Web-Container auf Port `3020`
- Oeffentliche interne Voranmeldung ohne Login
- Tagesuebersicht mit Wachen-Scope, Statusfilter und Suche
- Besuch anlegen, bearbeiten, einchecken, auschecken
- Druckoptimierte HTML-Ansicht fuer den Besucherschein
- Admin-Modelle fuer Wachen, Karte, Hinweistexte, Systemeinstellungen und Auditlog
- Aufbewahrungs-Command fuer Loeschung oder Anonymisierung alter Besuche
- Erste Tests fuer Voranmeldung, Scope, Statuswechsel und Retention

## Projektstruktur

- `visitor_manager/`: Django-Projektkonfiguration
- `core/`: Stammdaten, Rollenprofil, Auditlog, Einstellungen
- `visits/`: Besucher- und Besuchslogik, Views, Formulare
- `templates/`: Oberflaechen und Drucklayout
- `static/`: Anwendungscss und Druckcss

## Dokumentation

- Deployment: [DEPLOYMENT.md](C:/Users/General_Rothenburger/Nextcloud_wiweb/Besucher_Manager/DEPLOYMENT.md)

## GitHub Clone

```bash
git clone https://github.com/linuxlearner-germany/Besucher_Manager.git
cd Besucher_Manager
```

## Start auf `deb-srv-docker`

Der aktuelle Stand ist auf folgenden Zielbetrieb vorbelegt:

- Docker-Host: `deb-srv-docker`
- Webzugriff: `http://deb-srv-docker:3020/`
- Datenbank-Host: `MS-SRV-SQL`
- Datenbank-Engine: `Microsoft SQL Server`
- Datenbank-Name: `Besuchermngmt`
- Secure-Cookies: deaktiviert, damit HTTP auf Port `3020` direkt funktioniert
- Die komplette Laufzeitkonfiguration liegt versioniert in [.env](C:/Users/General_Rothenburger/Nextcloud_wiweb/Besucher_Manager/.env)
- Auf dem Server ist keine manuelle Python- oder Pip-Installation noetig; alles wird im Docker-Image gebaut
- Beim Start versucht der Container die MSSQL-Datenbank zu erreichen und `Besuchermngmt` bei Bedarf selbst anzulegen

Start:

```bash
docker compose up --build
```

Wenn der Start haengt oder fehlschlaegt:

```bash
docker compose logs -f web
```

Danach:

```bash
docker compose exec web python manage.py createsuperuser
```

Aufruf:

- Oeffentliche Voranmeldung: `http://deb-srv-docker:3020/`
- Login Wache: `http://deb-srv-docker:3020/accounts/login/`
- Admin: `http://deb-srv-docker:3020/admin/`

## Netzwerk-Security-Proxy spaeter

Im Repository ist absichtlich kein Reverse-Proxy-Container mehr enthalten.

Wenn spaeter vor dem Host ein Netzwerk-Security-Proxy oder eine zentrale Sicherheitskomponente geschaltet wird:

1. die externe URL in `DJANGO_ALLOWED_HOSTS` eintragen
2. `DJANGO_CSRF_TRUSTED_ORIGINS` auf die echte URL anpassen
3. bei HTTPS `DJANGO_SECURE_COOKIES=True` setzen

## Aufbewahrungsroutine

Loeschen:

```bash
docker compose exec web python manage.py purge_old_visits
```

Anonymisieren:

```bash
docker compose exec web python manage.py purge_old_visits --anonymize
```

Die Frist kommt standardmaessig aus `VISITOR_RETENTION_DAYS` oder aus `SystemSetting.retention_days`.

## Offene Punkte fuer den naechsten Schritt

- Benutzer-/Gruppenverwaltung im Admin weiter haerten
- Besucherschein fuer reales Papierformat und echten Drucker feinlayouten
- Exportfunktion fuer berechtigte Zwecke ergaenzen
- PDF-Erzeugung bei Bedarf mit WeasyPrint nachziehen
- Seed-Daten fuer Wachen und Standardtexte hinterlegen

## Hinweis zum aktuellen Arbeitsstand

In dieser lokalen Umgebung waren weder `python` noch `docker` verfuegbar. Das Repository wurde daher strukturell und logisch aufgebaut, aber nicht hier ausgefuehrt.
