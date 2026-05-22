IF OBJECT_ID('dbo.users', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.users', 'deactivated_at') IS NULL
    ALTER TABLE dbo.users ADD deactivated_at DATETIME2 NULL;
  IF COL_LENGTH('dbo.users', 'deactivated_by') IS NULL
    ALTER TABLE dbo.users ADD deactivated_by UNIQUEIDENTIFIER NULL;
  IF COL_LENGTH('dbo.users', 'last_login_at') IS NULL
    ALTER TABLE dbo.users ADD last_login_at DATETIME2 NULL;
END;

IF OBJECT_ID('dbo.visitors', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.visitors', 'is_active') IS NULL
    ALTER TABLE dbo.visitors ADD is_active BIT NOT NULL CONSTRAINT DF_visitors_is_active DEFAULT 1;
  IF COL_LENGTH('dbo.visitors', 'is_deleted') IS NULL
    ALTER TABLE dbo.visitors ADD is_deleted BIT NOT NULL CONSTRAINT DF_visitors_is_deleted DEFAULT 0;
  IF COL_LENGTH('dbo.visitors', 'deleted_at') IS NULL
    ALTER TABLE dbo.visitors ADD deleted_at DATETIME2 NULL;
  IF COL_LENGTH('dbo.visitors', 'deleted_by') IS NULL
    ALTER TABLE dbo.visitors ADD deleted_by UNIQUEIDENTIFIER NULL;
  IF COL_LENGTH('dbo.visitors', 'archived_at') IS NULL
    ALTER TABLE dbo.visitors ADD archived_at DATETIME2 NULL;
END;

IF OBJECT_ID('dbo.visits', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.visits', 'cancelled_at') IS NULL
    ALTER TABLE dbo.visits ADD cancelled_at DATETIME2 NULL;
  IF COL_LENGTH('dbo.visits', 'cancelled_by') IS NULL
    ALTER TABLE dbo.visits ADD cancelled_by UNIQUEIDENTIFIER NULL;
  IF COL_LENGTH('dbo.visits', 'cancel_reason') IS NULL
    ALTER TABLE dbo.visits ADD cancel_reason NVARCHAR(500) NULL;
END;

IF OBJECT_ID('dbo.gates', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.gates', 'deactivated_at') IS NULL
    ALTER TABLE dbo.gates ADD deactivated_at DATETIME2 NULL;
  IF COL_LENGTH('dbo.gates', 'deactivated_by') IS NULL
    ALTER TABLE dbo.gates ADD deactivated_by UNIQUEIDENTIFIER NULL;
END;

IF OBJECT_ID('dbo.badge_text_templates', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.badge_text_templates', 'deactivated_at') IS NULL
    ALTER TABLE dbo.badge_text_templates ADD deactivated_at DATETIME2 NULL;
  IF COL_LENGTH('dbo.badge_text_templates', 'deactivated_by') IS NULL
    ALTER TABLE dbo.badge_text_templates ADD deactivated_by UNIQUEIDENTIFIER NULL;
END;

IF OBJECT_ID('dbo.site_maps', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.site_maps', 'deactivated_at') IS NULL
    ALTER TABLE dbo.site_maps ADD deactivated_at DATETIME2 NULL;
  IF COL_LENGTH('dbo.site_maps', 'deactivated_by') IS NULL
    ALTER TABLE dbo.site_maps ADD deactivated_by UNIQUEIDENTIFIER NULL;
END;

IF OBJECT_ID('dbo.audit_logs', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.audit_logs', 'user_id') IS NULL
    ALTER TABLE dbo.audit_logs ADD user_id UNIQUEIDENTIFIER NULL;
END;
