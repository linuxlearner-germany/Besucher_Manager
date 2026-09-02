IF OBJECT_ID(N'dbo.user_roles', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_roles (
    user_id UNIQUEIDENTIFIER NOT NULL,
    role NVARCHAR(32) NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_user_roles_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_user_roles PRIMARY KEY (user_id, role),
    CONSTRAINT FK_user_roles_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
    CONSTRAINT CK_user_roles_role CHECK (role IN (N'admin', N'guard', N'sibe', N'kaskdt', N'custom'))
  );
END;

INSERT INTO dbo.user_roles(user_id, role)
SELECT id, role FROM dbo.users u
WHERE NOT EXISTS (SELECT 1 FROM dbo.user_roles ur WHERE ur.user_id = u.id AND ur.role = u.role);

IF COL_LENGTH(N'dbo.visits', N'source') IS NULL
  ALTER TABLE dbo.visits ADD source NVARCHAR(40) NULL;

EXEC(N'
  UPDATE dbo.visits
  SET source = CASE WHEN created_via_public_form = 1 THEN N''public_web'' ELSE N''legacy'' END
  WHERE source IS NULL;
');

IF COL_LENGTH(N'dbo.visitors', N'first_name') IS NOT NULL
  ALTER TABLE dbo.visitors ALTER COLUMN first_name NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.visitors', N'last_name') IS NOT NULL
  ALTER TABLE dbo.visitors ALTER COLUMN last_name NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.visitors', N'company') IS NOT NULL
  ALTER TABLE dbo.visitors ALTER COLUMN company NVARCHAR(255) NULL;
IF COL_LENGTH(N'dbo.visits', N'host_name') IS NOT NULL
  ALTER TABLE dbo.visits ALTER COLUMN host_name NVARCHAR(255) NULL;
IF COL_LENGTH(N'dbo.visits', N'purpose') IS NOT NULL
  ALTER TABLE dbo.visits ALTER COLUMN purpose NVARCHAR(500) NULL;

IF COL_LENGTH(N'dbo.users', N'is_tombstoned') IS NULL
  ALTER TABLE dbo.users ADD is_tombstoned BIT NOT NULL CONSTRAINT DF_users_is_tombstoned DEFAULT 0;
IF COL_LENGTH(N'dbo.users', N'deleted_at') IS NULL
  ALTER TABLE dbo.users ADD deleted_at DATETIME2 NULL;
IF COL_LENGTH(N'dbo.users', N'deleted_by') IS NULL
  ALTER TABLE dbo.users ADD deleted_by UNIQUEIDENTIFIER NULL;

IF COL_LENGTH(N'dbo.error_logs', N'request_id') IS NULL
  ALTER TABLE dbo.error_logs ADD request_id UNIQUEIDENTIFIER NULL;

IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = N'maintenance_mode')
  INSERT INTO dbo.system_settings([key], [value], description)
  VALUES(N'maintenance_mode', N'false', N'Sperrt fachliche Zugriffe fuer Nicht-Administratoren.');

UPDATE dbo.users
SET gate_id = NULL, default_gate_id = NULL, updated_at = SYSUTCDATETIME()
WHERE role = N'guard' AND (gate_id IS NOT NULL OR default_gate_id IS NOT NULL);
