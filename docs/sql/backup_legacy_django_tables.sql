/*
  Vor der Bereinigung alter Django-Tabellen:
  - Datenbankbackup auf SQL-Server-Ebene erstellen
  - Dieses Script kann als Export-/Pruefhilfe verwendet werden
  - Keine Secrets in dieses Script eintragen
*/

SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'dbo'
  AND (
    TABLE_NAME LIKE 'auth[_]%'
    OR TABLE_NAME LIKE 'django[_]%'
    OR TABLE_NAME LIKE 'core[_]%'
    OR TABLE_NAME IN ('visits_visit', 'visits_visitor')
  )
ORDER BY TABLE_NAME;

SELECT TOP 100 * FROM dbo.auth_user;
SELECT TOP 100 * FROM dbo.auth_group;
SELECT TOP 100 * FROM dbo.django_migrations;
SELECT TOP 100 * FROM dbo.core_gate;
SELECT TOP 100 * FROM dbo.core_systemsetting;
SELECT TOP 100 * FROM dbo.visits_visit;
SELECT TOP 100 * FROM dbo.visits_visitor;

/*
  Danach die Daten nach Bedarf per SSMS/DataGrip exportieren
  und erst im Anschluss die Cleanup-Migration ausfuehren.
*/
