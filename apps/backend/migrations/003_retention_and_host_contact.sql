IF COL_LENGTH('dbo.visits', 'host_email') IS NULL
BEGIN
  ALTER TABLE dbo.visits
  ADD host_email NVARCHAR(255) NULL;
END;

IF COL_LENGTH('dbo.visits', 'host_phone') IS NULL
BEGIN
  ALTER TABLE dbo.visits
  ADD host_phone NVARCHAR(80) NULL;
END;

IF NOT EXISTS (
  SELECT 1
  FROM dbo.system_settings
  WHERE [key] = 'visitor_retention_days'
)
BEGIN
  INSERT INTO dbo.system_settings ([key], [value], description)
  VALUES ('visitor_retention_days', '90', 'Retention in days for visit cleanup. Use disabled to skip cleanup.');
END;
