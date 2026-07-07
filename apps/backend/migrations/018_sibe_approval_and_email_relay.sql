IF OBJECT_ID('dbo.visits', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.visits', 'approval_status') IS NULL
    ALTER TABLE dbo.visits ADD approval_status NVARCHAR(32) NOT NULL CONSTRAINT df_visits_approval_status DEFAULT 'approved';

  IF COL_LENGTH('dbo.visits', 'approval_note') IS NULL
    ALTER TABLE dbo.visits ADD approval_note NVARCHAR(1000) NULL;

  IF COL_LENGTH('dbo.visits', 'approval_decided_by') IS NULL
    ALTER TABLE dbo.visits ADD approval_decided_by UNIQUEIDENTIFIER NULL;

  IF COL_LENGTH('dbo.visits', 'approval_decided_at') IS NULL
    ALTER TABLE dbo.visits ADD approval_decided_at DATETIME2 NULL;
END;

IF OBJECT_ID('dbo.visits', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.visits', 'approval_status') IS NOT NULL
    EXEC sp_executesql N'
      UPDATE dbo.visits
      SET approval_status = ''approved''
      WHERE approval_status IS NULL OR approval_status = '''';
    ';
END;

IF OBJECT_ID('dbo.system_settings', 'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'sibe_approval_required')
    INSERT INTO dbo.system_settings ([key], [value], description)
    VALUES ('sibe_approval_required', 'true', 'Require SiBe approval before guard check-in and badge print');

  IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'mail_relay_enabled')
    INSERT INTO dbo.system_settings ([key], [value], description)
    VALUES ('mail_relay_enabled', 'false', 'Enable SMTP relay for approval notifications');

  IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'mail_relay_host')
    INSERT INTO dbo.system_settings ([key], [value], description)
    VALUES ('mail_relay_host', '', 'SMTP relay host');

  IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'mail_relay_port')
    INSERT INTO dbo.system_settings ([key], [value], description)
    VALUES ('mail_relay_port', '587', 'SMTP relay port');

  IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'mail_relay_secure')
    INSERT INTO dbo.system_settings ([key], [value], description)
    VALUES ('mail_relay_secure', 'false', 'Use implicit TLS for SMTP relay');

  IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'mail_relay_username')
    INSERT INTO dbo.system_settings ([key], [value], description)
    VALUES ('mail_relay_username', '', 'SMTP relay username');

  IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'mail_relay_password')
    INSERT INTO dbo.system_settings ([key], [value], description)
    VALUES ('mail_relay_password', '', 'SMTP relay password');

  IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'mail_relay_from')
    INSERT INTO dbo.system_settings ([key], [value], description)
    VALUES ('mail_relay_from', '', 'Sender address for system emails');

  IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'mail_relay_approval_to')
    INSERT INTO dbo.system_settings ([key], [value], description)
    VALUES ('mail_relay_approval_to', '', 'Comma separated recipients for SiBe approval requests');
END;
