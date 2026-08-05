IF OBJECT_ID('dbo.system_settings', 'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'visit_retention_enabled')
    INSERT INTO dbo.system_settings ([key], [value], description) VALUES ('visit_retention_enabled', 'false', 'Automatische Löschung alter Vorgänge aktivieren');
  IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'visit_retention_years')
    INSERT INTO dbo.system_settings ([key], [value], description) VALUES ('visit_retention_years', '10', 'Aufbewahrungsdauer abgeschlossener Vorgänge in Jahren');
  IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'visit_retention_last_run')
    INSERT INTO dbo.system_settings ([key], [value], description) VALUES ('visit_retention_last_run', '', 'Zeitpunkt des letzten Bereinigungslaufs');
END;
