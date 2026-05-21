# Interne Besucherverwaltung

Kleines Django-MVP fuer die interne Besucherverwaltung an Pforte und Wache.

## Enthalten im aktuellen Stand

- Django-Projekt mit Login, Admin und Rollenprofil fuer Wache/Admin
- Docker-Grundgeruest mit `web`, `db` und `caddy`
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
- `infra/`: Reverse-Proxy-Konfiguration

## Dokumentation

- Deployment: [DEPLOYMENT.md](C:/Users/General_Rothenburger/Nextcloud_wiweb/Besucher_Manager/DEPLOYMENT.md)

## Lokaler Start per Docker Compose

1. `.env.example` nach `.env` kopieren und Werte setzen
2. Container bauen und starten:

```bash
docker compose up --build
```

3. Datenbank migrieren und Admin-Benutzer anlegen:

```bash
docker compose exec web python manage.py createsuperuser
```

4. Anwendung aufrufen:

- Oeffentliche Voranmeldung: `http://localhost:8080/`
- Login Wache: `http://localhost:8080/accounts/login/`
- Admin: `http://localhost:8080/admin/`

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
