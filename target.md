Ja — hier ist eine **vollständige, professionelle README.md für das komplette Zielprojekt**. Sie ist so geschrieben, dass ein erfahrener Entwickler sofort versteht, **was gebaut werden soll, wie die Architektur aussieht, welche Module existieren, wie Deployment gedacht ist und welche Regeln gelten**.

````markdown
# Besucher Manager

Interne Besucherverwaltung für Wache, Pforte und Werkszugang.

Der **Besucher Manager** ist eine interne Webanwendung zur Voranmeldung, Verwaltung, Einlasskontrolle und Ausfahrtskontrolle von Besuchern an einem Unternehmensstandort mit einer oder mehreren Wachen.

Die Anwendung ersetzt manuelle Besucherlisten und Papierprozesse durch einen kontrollierten digitalen Ablauf:

```text
Mitarbeiter meldet Besucher vor
→ Wache sieht erwarteten Besucher
→ Besucher erscheint an der Wache
→ Wache checkt Besucher ein
→ Besucherschein wird gedruckt
→ Besucher geht zum Ansprechpartner
→ Ansprechpartner unterschreibt Besucherschein vor Ausfahrt
→ Wache prüft Unterschrift
→ Wache checkt Besucher aus
````

---

# 1. Projektziel

Ziel ist eine interne, auditierbare, selbst betriebene Besucherverwaltung.

Die Anwendung soll:

* Besucher voranmelden
* Besucher an der Wache verwalten
* mehrere Wachen / Eingänge unterstützen
* Besucherscheine drucken
* Geländeplan und Sicherheitshinweise auf dem Besucherschein anzeigen
* Fotografierverbot und Besucherregeln abbilden
* Check-in und Check-out dokumentieren
* beim Check-out eine Unterschriftsbestätigung erzwingen
* Admin-Funktionen für Wachen, Benutzer, Texte und Karte bereitstellen
* vollständig per Docker betrieben werden
* einen externen Microsoft SQL Server verwenden
* ohne lokale Node/npm-Installation auf dem Server laufen

Die Anwendung ist ausschließlich für den internen Betrieb vorgesehen.

---

# 2. Grundsatzentscheidung

Dieses Projekt wird **nicht** mit Django umgesetzt.

Nicht Bestandteil der Zielarchitektur:

* kein Django
* kein Python-Backend
* kein Django Admin
* keine Django Templates
* keine Django Migrationen
* kein Gunicorn
* keine Python-Abhängigkeiten
* kein manuelles `npm install` auf dem Server

Das Projekt wird als vollständige Eigenentwicklung mit **JavaScript / TypeScript** umgesetzt.

---

# 3. Zielarchitektur

## 3.1 Gesamtarchitektur

```text
Browser Clients
├── Mitarbeiter-Voranmeldung ohne Login
├── Wache-GUI mit Login
└── Admin-Panel mit Login

        │ HTTP
        ▼

Docker-Host: deb-srv-docker
└── Node.js / TypeScript App
    ├── React Frontend
    ├── REST API
    ├── Authentifizierung
    ├── Rollenprüfung
    ├── Auditlog
    ├── Druckansicht
    └── Upload-Verzeichnis für Geländeplan

        │ TCP 1433 oder konfigurierter SQL-Port
        ▼

Microsoft SQL Server: MS-SRV-SQL
└── Datenbank: Besuchermngmt
```

---

## 3.2 Frontend

Geplanter Stack:

* React
* TypeScript
* Vite
* eigenes CSS oder leichtgewichtiges UI-System
* druckoptimiertes HTML für Besucherscheine

Frontend-Bereiche:

```text
/                         öffentliche interne Voranmeldung
/login                    Login für Wache/Admin
/wache                    Wache-Tagesübersicht
/wache/besuche/:id        Besucherdetails
/wache/besuche/:id/druck  Besucherschein-Druckansicht
/admin                    Admin-Dashboard
/admin/wachen             Wachenverwaltung
/admin/benutzer           Benutzerverwaltung
/admin/texte              Hinweistextverwaltung
/admin/karte              Geländeplanverwaltung
/admin/audit              Auditlog
```

---

## 3.3 Backend

Geplanter Stack:

* Node.js 22 LTS
* TypeScript
* Express oder Fastify
* REST API
* Microsoft-SQL-Server-Zugriff über `mssql`
* serverseitige Validierung
* Session- oder Token-basierte Authentifizierung
* Rollenprüfung
* Auditlog
* Datenbankmigrationen über eigene Migrationen oder Migrationstool

Backend-Aufgaben:

* API bereitstellen
* Eingaben validieren
* Benutzer authentifizieren
* Rollen und Wachen-Scope prüfen
* Besuche speichern
* Check-in / Check-out durchführen
* Besucherschein-Daten liefern
* Admin-Funktionen bereitstellen
* Auditlog schreiben
* Migrationen ausführen

---

## 3.4 Datenbank

Die Anwendung nutzt einen externen Microsoft SQL Server.

Die Datenbank läuft **nicht** als Docker-Container.

Testumgebung:

```text
Docker-Server: deb-srv-docker
SQL-Server: MS-SRV-SQL
Datenbank: Besuchermngmt
Datenbankbenutzer: dockerBesuchermngmt
```

Zugangsdaten werden ausschließlich über `.env` bereitgestellt.

Keine echten Zugangsdaten dürfen ins Repository committed werden.

---

# 4. Deployment-Grundsätze

Auf dem Zielserver läuft nur Docker / Docker Compose.

Auf dem Server wird **kein** lokales `npm install` ausgeführt.

Alle Abhängigkeiten werden während des Docker-Builds installiert.

## 4.1 Deployment auf dem Docker-Server

Typischer Ablauf:

```bash
cd ~/Besucher_Manager
git pull
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d
docker compose logs -f app
```

Die Anwendung soll erreichbar sein unter:

```text
http://deb-srv-docker:3030
```

Der Host-Port muss über `.env` konfigurierbar sein.

Beispiel:

```env
APP_PORT=3030
```

---

## 4.2 Docker-Anforderungen

Das Projekt muss vollständig per Docker baubar und startbar sein.

Anforderungen:

* Multi-stage Dockerfile bevorzugt
* `npm install` nur im Docker-Build
* Frontend-Build im Docker-Build
* Backend-Build im Docker-Build
* Runtime-Container enthält nur notwendige Abhängigkeiten
* Upload-Verzeichnis wird persistent eingebunden
* keine Datenbank im Compose-Stack
* App lauscht intern auf Port `3030`

Compose-Portmapping:

```yaml
ports:
  - "${APP_PORT:-3030}:3030"
```

Volumes:

```text
uploads
```

---

# 5. Umgebungsvariablen

Beispiel `.env.example`:

```env
NODE_ENV=production
APP_PORT=3030
APP_SECRET=CHANGE_ME

MSSQL_HOST=MS-SRV-SQL
MSSQL_PORT=1433
MSSQL_DATABASE=Besuchermngmt
MSSQL_USER=dockerBesuchermngmt
MSSQL_PASSWORD=CHANGE_ME
MSSQL_ENCRYPT=false
MSSQL_TRUST_SERVER_CERTIFICATE=true
```

Regeln:

* `.env` wird niemals committed.
* `.env.example` enthält nur Platzhalter.
* Passwörter, Tokens und Secrets liegen nur auf dem Server.
* Codex-Prompts dürfen keine echten Zugangsdaten enthalten.
* README und DEPLOYMENT dürfen keine echten Passwörter enthalten.

---

# 6. Fachlicher Gesamtprozess

## 6.1 Voranmeldung

Ein interner Mitarbeiter öffnet die öffentliche interne Startseite ohne Login.

Der Mitarbeiter trägt Besucherdaten und Besuchsinformationen ein.

Nach dem Absenden erscheint die Voranmeldung in der Tagesübersicht der zuständigen Wache.

Der Mitarbeiter hat keinen Zugriff auf Besucherlisten.

---

## 6.2 Ankunft an der Wache

Der Besucher erscheint an der Wache.

Die Wache öffnet die Tagesübersicht, sucht den Besucher und prüft die Angaben.

Die Wache checkt den Besucher ein.

Beim Check-in wird ein Besucherschein erzeugt und gedruckt.

---

## 6.3 Besuch auf dem Gelände

Der Besucher trägt den Besucherschein sichtbar mit sich.

Der Besucherschein enthält:

* Besucherdaten
* Ansprechpartner
* Wache / Eingang
* Gültigkeitszeitraum
* Geländeplan
* Sicherheitshinweise
* Fotografierverbot
* Unterschriftsfeld

---

## 6.4 Ausfahrt / Verlassen des Geländes

Vor Ausfahrt oder Verlassen des Geländes muss der besuchte Ansprechpartner den Besucherschein unterschreiben.

Die Wache prüft die Unterschrift.

Der Besucher kann nur ausgecheckt werden, wenn die Wache bestätigt:

```text
Besucherschein wurde vom Ansprechpartner unterschrieben.
```

Danach wird der Besuch ausgecheckt und protokolliert.

---

# 7. Module

# 7.1 Öffentliche interne Voranmeldung

Route:

```text
/
```

Zielgruppe:

* interne Mitarbeiter
* kein Benutzerkonto erforderlich

Felder:

```text
Besucher:
- Vorname
- Nachname
- Firma / Organisation
- Telefonnummer optional
- E-Mail-Adresse optional
- Kennzeichen optional

Besuch:
- Ansprechpartner
- Abteilung / Bereich
- Besuchszweck
- zuständige Wache
- gültig von
- gültig bis
- Bemerkung optional
```

Regeln:

* keine Anmeldung erforderlich
* kein Zugriff auf Besucherlisten
* Wache muss aktiv sein
* Pflichtfelder werden serverseitig validiert
* `gültig bis` muss nach `gültig von` liegen
* IP-Adresse wird serverseitig protokolliert
* Rate-Limiting erforderlich
* nach erfolgreicher Anmeldung Erfolgsmeldung anzeigen

Initialer Status:

```text
pre_registered
```

Auditlog:

```text
PUBLIC_PRE_REGISTRATION_CREATED
```

API:

```text
GET  /api/public/gates
POST /api/public/pre-registrations
```

---

# 7.2 Login

Route:

```text
/login
```

Benutzerrollen:

```text
admin
guard
```

Anforderungen:

* keine Klartextpasswörter
* Passwort-Hashing mit bcrypt oder argon2
* Login per sicherer Session oder httpOnly-Cookie
* `/api/auth/me` liefert Benutzer und Rolle
* Admins werden zum Admin-Panel geleitet
* Wache-Benutzer werden zur Wache-GUI geleitet

API:

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

---

# 7.3 Wache-GUI

Route:

```text
/wache
```

Zielgruppe:

* Pforte
* Wache
* Empfang

Die Wache-GUI ist die operative Hauptoberfläche.

## Hauptfunktionen

* heutige Besucher anzeigen
* Voranmeldungen sehen
* aktive Besucher sehen
* ausgecheckte Besucher sehen
* Besucher suchen
* Besucher einchecken
* Besucherschein drucken
* Besucher auschecken

## Tabellenansicht

Spalten:

```text
- Status
- Uhrzeit
- Besucher
- Firma
- Ansprechpartner
- Abteilung / Bereich
- Besuchszweck
- gültig bis
- Aktionen
```

## Suche

Suchbar nach:

```text
- Besuchername
- Firma
- Ansprechpartner
- Kennzeichen
- Besuchsnummer
```

## Filter

```text
- Alle
- Vorangemeldet
- Eingecheckt
- Ausgecheckt
```

## Wache-Scope

Ein Wache-Benutzer sieht nur Besucher seiner eigenen Wache.

Diese Einschränkung muss serverseitig geprüft werden.

Sie darf nicht nur im Frontend umgesetzt werden.

API:

```text
GET  /api/guard/visits/today
GET  /api/guard/visits/:id
POST /api/guard/visits/:id/check-in
POST /api/guard/visits/:id/check-out
POST /api/guard/visits/:id/print-log
```

---

# 7.4 Check-in

Ein Besucher kann eingecheckt werden, wenn er vorangemeldet ist.

Regeln:

* nur für eingeloggte Wache/Admin
* Wache-Scope prüfen
* nur Status `pre_registered`
* `check_in_at` wird serverseitig gesetzt
* Status wird auf `checked_in` gesetzt
* Auditlog wird geschrieben

Auditlog:

```text
VISIT_CHECKED_IN
```

---

# 7.5 Check-out

Ein Besucher kann ausgecheckt werden, wenn er eingecheckt ist.

Vor dem Check-out muss bestätigt werden:

```text
Besucherschein wurde vom Ansprechpartner unterschrieben.
```

Regeln:

* nur für eingeloggte Wache/Admin
* Wache-Scope prüfen
* nur Status `checked_in`
* `signed_by_host_confirmed` muss `true` sein
* `check_out_at` wird serverseitig gesetzt
* Status wird auf `checked_out` gesetzt
* Auditlog wird geschrieben

Optionale Felder:

```text
checkout_note
```

Auditlog:

```text
VISIT_CHECKED_OUT
```

---

# 7.6 Besucherschein

Route:

```text
/wache/besuche/:id/druck
```

Der Besucherschein wird als druckoptimierte HTML-Seite umgesetzt.

Für den MVP ist kein PDF erforderlich.

Kein QR-Code.

## Inhalt

```text
- Überschrift "BESUCHER"
- Besuchsnummer
- Name des Besuchers
- Firma / Organisation
- Ansprechpartner
- Abteilung / Bereich
- Besuchszweck
- Wache / Eingang
- gültig von
- gültig bis
- Geländeplan / Karte
- Sicherheitshinweise
- Fotografierverbot
- Unterschriftsfeld für Ansprechpartner
- Hinweis zur Unterschrift vor Ausfahrt
```

Pflichttext:

```text
Vor Ausfahrt / Verlassen des Geländes durch den Ansprechpartner zu unterschreiben.
```

## Druckanforderungen

* Print-CSS
* Navigation beim Druck ausblenden
* gute Lesbarkeit
* geeignet für A4-Ausdruck
* später optional andere Formate
* Browserdruck reicht für MVP

---

# 7.7 Admin-Panel

Route:

```text
/admin
```

Das Admin-Panel ist eine eigene React-Oberfläche.

Es wird kein Django Admin verwendet.

Zielgruppe:

* Administratoren

## Funktionen

```text
- Wachen / Eingänge verwalten
- Benutzer verwalten
- Rollen verwalten
- Geländeplan / Karte hochladen oder tauschen
- Hinweis- und Regeltexte pflegen
- Fotografierverbot-Text pflegen
- Systemparameter verwalten
- Auditlog einsehen
- Systemstatus einsehen
```

## Sicherheit

* nur Admins dürfen `/admin` nutzen
* Backend prüft Rolle serverseitig
* Admin-Aktionen werden protokolliert

Admin-API:

```text
GET    /api/admin/gates
POST   /api/admin/gates
PUT    /api/admin/gates/:id

GET    /api/admin/users
POST   /api/admin/users
PUT    /api/admin/users/:id

GET    /api/admin/badge-texts
PUT    /api/admin/badge-texts/:id

POST   /api/admin/site-map

GET    /api/admin/audit-logs
GET    /api/admin/system-status
```

---

# 8. Datenmodell

## 8.1 users

```text
id
username
password_hash
role
gate_id nullable
is_active
created_at
updated_at
```

Rollen:

```text
admin
guard
```

---

## 8.2 gates

```text
id
name
description
location
is_active
sort_order
created_at
updated_at
```

Beispiel:

```text
name: Hauptwache
description: Standard-Wache
location: Werk / Eingang
is_active: true
sort_order: 10
```

---

## 8.3 visitors

```text
id
first_name
last_name
company
phone
email
license_plate
created_at
updated_at
```

---

## 8.4 visits

```text
id
visitor_id
gate_id
host_name
host_department
purpose
location
valid_from
valid_until
check_in_at
check_out_at
badge_number
status
created_via_public_form
submitted_ip_address
signed_by_host_confirmed
checkout_note
notes
created_at
updated_at
```

Statuswerte:

```text
pre_registered
checked_in
checked_out
cancelled
```

---

## 8.5 site_maps

```text
id
name
file_path
is_active
uploaded_by
created_at
```

---

## 8.6 badge_text_templates

```text
id
name
text_type
content
is_active
updated_by
updated_at
```

Texttypen:

```text
security_notice
photo_ban
footer
signature_notice
```

---

## 8.7 system_settings

```text
id
key
value
description
updated_at
```

---

## 8.8 audit_logs

```text
id
user_id nullable
action
object_type
object_id
ip_address
metadata_json
created_at
```

---

## 8.9 schema_migrations

```text
id
applied_at
```

---

# 9. Migrationen

Die Anwendung benötigt einen eigenen Migrationsmechanismus.

Anforderungen:

* Migrationen liegen versioniert im Repository.
* Migrationen werden sortiert ausgeführt.
* Bereits ausgeführte Migrationen werden übersprungen.
* Ausgeführte Migrationen werden in `schema_migrations` gespeichert.
* Migrationen sind idempotent, soweit sinnvoll.
* Seed-Daten dürfen nicht bei jedem Start doppelt erzeugt werden.
* Fehler bei Migrationen müssen den Containerstart klar abbrechen.

Bevorzugter Ablauf beim Containerstart:

```text
1. Umgebung prüfen
2. Verbindung zum SQL Server testen
3. Migrationen ausführen
4. Server starten
```

---

# 10. Seed-Daten

Für die Testumgebung muss mindestens eine aktive Wache vorhanden sein.

Initiale Wache:

```text
Name: Hauptwache
Standort: Werk / Eingang
Hinweis: Standard-Wache
Aktiv: ja
```

Seed-Daten müssen idempotent sein.

Das bedeutet:

* wenn `Hauptwache` schon existiert, keine zweite `Hauptwache` anlegen
* vorhandene produktive Daten nicht überschreiben
* keine echten Passwörter hardcoden

---

# 11. Sicherheit

## 11.1 Allgemein

* keine Secrets im Repository
* keine `.env` committen
* `.env.example` nur mit Platzhaltern
* serverseitige Validierung aller Eingaben
* Rollenprüfung im Backend
* Wache-Scope serverseitig erzwingen
* Auditlog für kritische Aktionen
* Rate-Limiting für öffentliche Voranmeldung
* sichere Passwort-Hashes
* keine Stacktraces im Browser
* keine technischen Fehlerdetails für normale Benutzer
* technische Fehler serverseitig loggen

---

## 11.2 Authentifizierung

Anforderungen:

* Login für Wache/Admin
* keine Klartextpasswörter
* bcrypt oder argon2
* sichere Session oder httpOnly-Cookie
* Logout muss Session/Token ungültig machen
* `/api/auth/me` für Frontend-State

---

## 11.3 Autorisierung

Regeln:

```text
public:
- darf Wachen laden
- darf Voranmeldung absenden
- darf keine Besucherlisten lesen

guard:
- darf eigene Wache sehen
- darf Besucher der eigenen Wache einchecken
- darf Besucher der eigenen Wache auschecken
- darf Besucherschein der eigenen Wache drucken

admin:
- darf alle Wachen administrieren
- darf Benutzer administrieren
- darf Texte und Karte verwalten
- darf Auditlog sehen
```

---

## 11.4 Auditlog

Wichtige Aktionen:

```text
PUBLIC_PRE_REGISTRATION_CREATED
USER_LOGIN
USER_LOGOUT
VISIT_CHECKED_IN
VISIT_CHECKED_OUT
VISIT_BADGE_PRINTED
ADMIN_GATE_CREATED
ADMIN_GATE_UPDATED
ADMIN_USER_CREATED
ADMIN_USER_UPDATED
ADMIN_BADGE_TEXT_UPDATED
ADMIN_SITE_MAP_UPLOADED
SYSTEM_SETTING_UPDATED
```

---

# 12. Datenschutz

Die Anwendung verarbeitet personenbezogene Besucherdaten.

Grundsätze:

* Datensparsamkeit
* keine unnötigen Pflichtfelder
* keine Ausweisnummer als Pflichtfeld
* keine Dokumentenscans im MVP
* keine Fotoaufnahme im MVP
* Zugriff nur für berechtigte Rollen
* Aufbewahrungsfrist definieren
* Löschung oder Anonymisierung alter Besuche
* Auditlog für sicherheitsrelevante Aktionen

Zu klären:

```text
- konkrete Löschfrist
- Datenschutztext für Besucher
- Informationspflicht an der Wache
- Betriebsrat / Datenschutzbeauftragter
- Export- oder Auskunftsprozess
```

---

# 13. Netzwerk

Die Anwendung läuft im internen Netzwerk.

Es gibt keinen HTTP-Reverse-Proxy als feste Anforderung.

Es kann jedoch Netzwerkfilter, Firewall-Regeln oder Paketfilter geben.

Benötigte Verbindungen:

```text
Clients/Wachen/Mitarbeiter -> deb-srv-docker:3030
deb-srv-docker -> MS-SRV-SQL:1433
```

Der SQL-Port muss über `.env` konfigurierbar sein.

---

# 14. Fehlerbehandlung

## 14.1 Frontend

Benutzer sollen klare, nicht-technische Fehlermeldungen sehen.

Beispiele:

```text
Die Voranmeldung konnte nicht gespeichert werden.
Die Wachen konnten nicht geladen werden.
Bitte prüfen Sie Ihre Eingaben.
Sie sind nicht berechtigt, diese Seite zu öffnen.
Der Besucher wurde bereits ausgecheckt.
```

Keine Stacktraces im Browser.

---

## 14.2 Backend

Technische Fehler werden serverseitig geloggt.

API-Fehler sollen strukturierte JSON-Antworten liefern.

Beispiel:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Bitte prüfen Sie die eingegebenen Daten.",
  "details": {
    "lastName": "Nachname ist erforderlich."
  }
}
```

Beispiele für Fehlercodes:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
DATABASE_ERROR
DATABASE_SCHEMA_MISSING
INVALID_STATUS_TRANSITION
```

---

# 15. API-Zielstruktur

## Public API

```text
GET  /api/public/gates
POST /api/public/pre-registrations
```

---

## Auth API

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

---

## Guard API

```text
GET  /api/guard/visits/today
GET  /api/guard/visits/:id
POST /api/guard/visits/:id/check-in
POST /api/guard/visits/:id/check-out
POST /api/guard/visits/:id/print-log
```

---

## Admin API

```text
GET    /api/admin/gates
POST   /api/admin/gates
PUT    /api/admin/gates/:id

GET    /api/admin/users
POST   /api/admin/users
PUT    /api/admin/users/:id

GET    /api/admin/badge-texts
PUT    /api/admin/badge-texts/:id

POST   /api/admin/site-map

GET    /api/admin/audit-logs
GET    /api/admin/system-status
```

---

## Health API

```text
GET /api/health
```

---

# 16. UI-Zielbild

## 16.1 Öffentliche Voranmeldung

Die Oberfläche soll einfach und verständlich sein.

Abschnitte:

```text
Besucher
- Vorname
- Nachname
- Firma
- Telefon
- E-Mail
- Kennzeichen

Besuch
- Ansprechpartner
- Abteilung
- Besuchszweck
- Wache
- Gültig von
- Gültig bis
- Bemerkung
```

Nach Absenden:

```text
Voranmeldung wurde erfolgreich gespeichert.
```

---

## 16.2 Wache-GUI

Die Wache-GUI soll als Arbeitsoberfläche funktionieren, nicht als Admin-System.

Startansicht:

```text
Heute erwartete Besucher
Aktuell auf dem Gelände
Ausgecheckte Besucher
Suche
Filter
```

Wichtige Buttons:

```text
Einchecken
Besucherschein drucken
Auschecken
Details
```

---

## 16.3 Admin-Panel

Das Admin-Panel soll modular aufgebaut sein.

Karten auf Dashboard:

```text
Wachen verwalten
Benutzer verwalten
Hinweistexte verwalten
Geländeplan verwalten
Auditlog
Systemstatus
```

---

# 17. Besucherschein-Layout

Der Besucherschein ist ein zentrales Element.

Pflichtinhalte:

```text
BESUCHER

Besuchsnummer
Name
Firma
Ansprechpartner
Abteilung / Bereich
Besuchszweck
Wache / Eingang
Gültig von
Gültig bis

Geländeplan / Karte

Sicherheitshinweise
Fotografierverbot

Unterschrift Ansprechpartner:
_____________________________

Vor Ausfahrt / Verlassen des Geländes durch den Ansprechpartner zu unterschreiben.
```

Kein QR-Code im MVP.

---

# 18. Tests

Tests sollen dort ergänzt werden, wo sie sinnvoll ohne produktive Umgebung laufen.

Mindestens zu testen:

```text
- Validierung Voranmeldung
- Wache muss aktiv sein
- gültig bis > gültig von
- Check-in nur von pre_registered möglich
- Check-out nur von checked_in möglich
- Check-out benötigt signed_by_host_confirmed
- Wache-Scope wird serverseitig berücksichtigt
- Admin-Routen sind für Nicht-Admins gesperrt
```

Tests dürfen keine echten produktiven SQL-Zugangsdaten benötigen.

---

# 19. Nicht-Ziele des MVP

Nicht Bestandteil der ersten Version:

```text
- QR-Code
- Self-Service-Kiosk
- E-Mail-Benachrichtigung
- LDAP / Active Directory
- Mehrsprachigkeit
- Fotoaufnahme
- Ausweisdokument-Scan
- direkte Druckeransteuerung vom Server
- PDF-Archivierung
- mobile App
- komplexe Mandantenfähigkeit
```

Diese Funktionen können später ergänzt werden.

---

# 20. Entwicklungsregeln

```text
- keine echten Zugangsdaten committen
- keine .env committen
- keine Django/Python-Komponenten wieder aktivieren
- keine Businesslogik nur im Frontend absichern
- alle kritischen Prüfungen serverseitig
- neue Tabellen nur über Migrationen
- neue Admin-Aktionen mit Auditlog
- neue Wache-Funktionen mit Wache-Scope
- kleine nachvollziehbare Commits
- Docker-Build muss reproduzierbar bleiben
- kein manuelles npm install auf dem Server dokumentieren
```

---

# 21. MVP-Abnahmekriterien

Der MVP gilt als erfüllt, wenn:

```text
- die Anwendung per Docker gebaut werden kann
- der Container ohne manuelles npm install startet
- die App unter http://deb-srv-docker:3030 erreichbar ist
- die Verbindung zum externen MS SQL Server funktioniert
- Migrationen ausgeführt werden
- mindestens eine aktive Wache vorhanden ist
- die öffentliche Voranmeldung funktioniert
- die Voranmeldung in der Wache-Tagesübersicht erscheint
- Login für Wache/Admin funktioniert
- ein Besucher eingecheckt werden kann
- ein Besucherschein gedruckt werden kann
- ein Besucher nur mit bestätigter Unterschrift ausgecheckt werden kann
- das Admin-Panel als eigene Oberfläche existiert
- Wachen, Benutzer, Texte und Karte administrierbar sind
- Auditlog-Einträge erzeugt werden
- keine Django-/Python-Komponenten aktiv genutzt werden
- keine Secrets im Repository enthalten sind
```

---

# 22. Aktueller empfohlener Arbeitsplan

## Phase 1: Technische Basis

```text
- Node.js/TypeScript-Projektstruktur
- React/Vite-Frontend
- Express/Fastify-Backend
- Dockerfile
- docker-compose.yml
- MSSQL-Verbindung
- Migrationen
- Seed Hauptwache
```

## Phase 2: Public Flow

```text
- Wachen laden
- Voranmeldeformular
- serverseitige Validierung
- Voranmeldung speichern
- Erfolgsmeldung
- Auditlog
```

## Phase 3: Auth

```text
- Benutzer-Tabelle
- Passwort-Hashing
- Login
- Logout
- /api/auth/me
- Rollen admin/guard
```

## Phase 4: Wache

```text
- Tagesübersicht
- Suche
- Filter
- Check-in
- Check-out
- Besucherdetails
- Druckansicht
```

## Phase 5: Admin

```text
- Wachenverwaltung
- Benutzerverwaltung
- Textverwaltung
- Kartenverwaltung
- Auditlog
- Systemstatus
```

## Phase 6: Härtung

```text
- Rate-Limiting
- bessere Fehlerbehandlung
- Tests
- Datenschutzfunktionen
- Löschung/Anonymisierung
- Deployment-Dokumentation
```

---

# 23. Kurzfassung für Entwickler

Der Besucher Manager ist eine interne, Docker-betriebene Node.js/TypeScript-Anwendung mit React-Frontend und externem Microsoft SQL Server.

Sie bildet den vollständigen Besucherprozess an einer Wache ab:

```text
Voranmelden
→ Einchecken
→ Besucherschein drucken
→ Ansprechpartner unterschreibt
→ Auschecken
→ Auditlog / Aufbewahrung
```

Die Anwendung muss sicher, auditierbar, ohne Django/Python, ohne manuelles npm auf dem Server und vollständig Docker-basiert betrieben werden.

```
```
