IF OBJECT_ID('dbo.field_definitions', 'U') IS NOT NULL
BEGIN
  UPDATE dbo.field_definitions
  SET label = 'Geschäftsfeld', show_in_public = 1, updated_at = SYSUTCDATETIME()
  WHERE field_key = 'host_department';

  UPDATE dbo.field_definitions
  SET show_in_public = 1, updated_at = SYSUTCDATETIME()
  WHERE field_key = 'visitor_city';

  UPDATE dbo.field_definitions
  SET show_in_public = 1, required_public = 1, updated_at = SYSUTCDATETIME()
  WHERE field_key = 'host_email';
END;

IF OBJECT_ID('dbo.visits', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.visits', 'confirmation_sent_at') IS NULL
    ALTER TABLE dbo.visits ADD confirmation_sent_at DATETIME2 NULL;
  IF COL_LENGTH('dbo.visits', 'reminder_sent_at') IS NULL
    ALTER TABLE dbo.visits ADD reminder_sent_at DATETIME2 NULL;
  IF COL_LENGTH('dbo.visits', 'rejected_at') IS NULL
    ALTER TABLE dbo.visits ADD rejected_at DATETIME2 NULL;
  IF COL_LENGTH('dbo.visits', 'rejected_by') IS NULL
    ALTER TABLE dbo.visits ADD rejected_by UNIQUEIDENTIFIER NULL;
  IF COL_LENGTH('dbo.visits', 'rejection_note') IS NULL
    ALTER TABLE dbo.visits ADD rejection_note NVARCHAR(1000) NULL;
END;
