IF OBJECT_ID('dbo.site_maps', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.site_maps', 'original_file_name') IS NULL
    ALTER TABLE dbo.site_maps ADD original_file_name NVARCHAR(255) NULL;
  IF COL_LENGTH('dbo.site_maps', 'stored_file_name') IS NULL
    ALTER TABLE dbo.site_maps ADD stored_file_name NVARCHAR(255) NULL;
  IF COL_LENGTH('dbo.site_maps', 'mime_type') IS NULL
    ALTER TABLE dbo.site_maps ADD mime_type NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.site_maps', 'file_size_bytes') IS NULL
    ALTER TABLE dbo.site_maps ADD file_size_bytes BIGINT NULL;
  IF COL_LENGTH('dbo.site_maps', 'updated_at') IS NULL
    ALTER TABLE dbo.site_maps ADD updated_at DATETIME2 NOT NULL CONSTRAINT DF_site_maps_updated_at DEFAULT SYSUTCDATETIME();
END;

IF OBJECT_ID('dbo.audit_logs', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.audit_logs', 'user_agent') IS NULL
    ALTER TABLE dbo.audit_logs ADD user_agent NVARCHAR(500) NULL;
  IF COL_LENGTH('dbo.audit_logs', 'metadata_json') IS NULL
    ALTER TABLE dbo.audit_logs ADD metadata_json NVARCHAR(MAX) NULL;
END;
