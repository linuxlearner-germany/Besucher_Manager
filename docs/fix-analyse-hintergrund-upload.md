# Fix-Analyse: Hintergrundbild-Upload funktioniert auf Server nicht

## Ausgangslage

- Die Admin-Oberflaeche zeigt den Bereich `Hintergrund` bereits an.
- Lokal in der Entwicklung funktioniert der Upload.
- Auf dem Zielserver funktioniert der Upload nicht.
- Der Container wurde bereits komplett neu gebaut.

## Bewertung

Damit ist ein reines Frontend- oder Build-Problem eher unwahrscheinlich.

Wenn die Funktion lokal funktioniert, aber auf dem Zielserver nicht, liegt die Ursache sehr wahrscheinlich in der Serverumgebung oder in der Laufzeitkonfiguration:

1. Upload-Request wird auf dem Server blockiert
2. Upload-Verzeichnis ist im Container nicht beschreibbar
3. Hintergrunddatei wird geschrieben, aber das Speichern der System-Settings schlaegt fehl
4. Reverse Proxy, WAF oder Upload-Limit greift auf dem Zielserver

Eine alte Datenbank ist in diesem Fall **nicht der Hauptverdacht**, aber weiterhin als Nebenursache moeglich, falls das Speichern der `system_settings` scheitert.

## Technischer Ablauf im Code

Der Hintergrund-Upload laeuft ueber:

- Frontend:
  - `POST /api/admin/ui-background/upload`
- Backend:
  - Route in `apps/backend/src/routes/admin.ts`

Der Ablauf ist:

1. Bilddatei per `multipart/form-data` empfangen
2. Datei unter `/app/uploads/ui-backgrounds/` speichern
3. System-Settings aktualisieren:
   - `ui_background_mode`
   - `ui_background_image_url`
   - `ui_background_image_name`
   - `ui_background_image_original_file_name`
4. Antwort an das Frontend zurueckgeben

## Wahrscheinlichste Fehlerursachen

### 1. Upload wird serverseitig blockiert

Moeglich durch:

- Reverse Proxy
- WAF
- Request-Size-Limit
- Security-Filter fuer `multipart/form-data`

Typische Anzeichen:

- HTTP `413`
- HTTP `400`
- HTTP `403`

### 2. Schreibrechte oder Volume-Problem

Die Datei soll nach:

```text
/app/uploads/ui-backgrounds/
```

Wenn dieses Verzeichnis nicht beschreibbar ist oder das Volume anders gemountet ist als lokal, scheitert der Upload trotz korrekter UI.

### 3. Datenbank- oder Settings-Fehler

Wenn die Datei geschrieben werden kann, aber das Speichern der Settings fehlschlaegt, ist die Datenbank wieder relevant.

Dann waeren moeglich:

- alte oder unvollstaendige Tabellenstruktur
- inkonsistente `system_settings`
- SQL-Fehler beim Schreiben

## Priorisierte Pruefschritte

### Schritt 1: Browser-Request pruefen

Im Browser:

1. `F12`
2. Tab `Netzwerk`
3. Upload erneut ausloesen
4. Request `POST /api/admin/ui-background/upload` oeffnen

Notieren:

- HTTP-Status
- Response-Body

Interpretation:

- `400` = Validierung / Dateityp / Dateiname
- `403` = Rechte / Session / CSRF
- `413` = Proxy / Upload-Limit
- `500` = Backend / Dateisystem / Datenbank

### Schritt 2: App-Logs pruefen

```bash
cd /opt/Besucher_Manager
docker compose logs --tail=200 app
```

Oder live:

```bash
cd /opt/Besucher_Manager
docker compose logs -f app
```

Dann den Upload erneut ausloesen.

### Schritt 3: Schreibtest im Container

```bash
cd /opt/Besucher_Manager
docker compose exec app sh -lc 'mkdir -p /app/uploads/ui-backgrounds && touch /app/uploads/ui-backgrounds/test-write && ls -lah /app/uploads/ui-backgrounds'
```

Wenn das scheitert:

- Problem ist sehr wahrscheinlich Volume / Rechte / Mount
- kein primaeres UI-Problem

### Schritt 4: Datenbank nur bei Bedarf pruefen

```sql
SELECT setting_key, setting_value
FROM system_settings
WHERE setting_key LIKE 'ui_background%';
```

Diese Pruefung ist dann sinnvoll, wenn:

- der Request das Backend erreicht
- der Schreibtest klappt
- aber der Upload trotzdem mit Backendfehler endet

## Zwischenfazit

Nach bisherigem Stand ist die wahrscheinlichste Reihenfolge:

1. Server- oder Proxyproblem beim Upload
2. Dateisystem- oder Volumeproblem im Container
3. Datenbankproblem beim Speichern der Settings

Eine alte Datenbank ist moeglich, aber aktuell **nicht die wahrscheinlichste Primaerursache**.

## Empfohlene Sofortpruefung

Diese drei Checks liefern am schnellsten Klarheit:

```bash
cd /opt/Besucher_Manager
docker compose logs --tail=200 app
```

```bash
cd /opt/Besucher_Manager
docker compose exec app sh -lc 'ls -lah /app/uploads && mkdir -p /app/uploads/ui-backgrounds && touch /app/uploads/ui-backgrounds/test-write && ls -lah /app/uploads/ui-backgrounds'
```

Im Browser:

- Statuscode und Antwort von `POST /api/admin/ui-background/upload`

## Erwartete naechste Entscheidung

- Wenn der Schreibtest fehlschlaegt: Volume/Rechte fixen
- Wenn der Request `413` liefert: Proxy-/Upload-Limit anpassen
- Wenn der Request `500` liefert und Schreiben klappt: Datenbank bzw. `system_settings` pruefen
- Wenn `403`: Session/CSRF/Proxy-Weitergabe pruefen
