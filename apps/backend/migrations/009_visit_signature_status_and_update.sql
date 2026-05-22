IF OBJECT_ID('dbo.visits', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.visits', 'host_signature_status') IS NULL
    ALTER TABLE dbo.visits ADD host_signature_status NVARCHAR(40) NOT NULL CONSTRAINT DF_visits_host_signature_status DEFAULT 'pending';
  IF COL_LENGTH('dbo.visits', 'host_signature_date') IS NULL
    ALTER TABLE dbo.visits ADD host_signature_date DATE NULL;
  IF COL_LENGTH('dbo.visits', 'host_signature_note') IS NULL
    ALTER TABLE dbo.visits ADD host_signature_note NVARCHAR(500) NULL;
  IF COL_LENGTH('dbo.visits', 'host_signature_confirmed_by') IS NULL
    ALTER TABLE dbo.visits ADD host_signature_confirmed_by UNIQUEIDENTIFIER NULL;
  IF COL_LENGTH('dbo.visits', 'host_signature_confirmed_at') IS NULL
    ALTER TABLE dbo.visits ADD host_signature_confirmed_at DATETIME2 NULL;
END;
