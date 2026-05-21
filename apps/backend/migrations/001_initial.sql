IF OBJECT_ID('dbo.gates', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.gates (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    name NVARCHAR(120) NOT NULL,
    description NVARCHAR(500) NULL,
    location NVARCHAR(255) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.users (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    username NVARCHAR(120) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    display_name NVARCHAR(255) NOT NULL,
    role NVARCHAR(32) NOT NULL,
    default_gate_id UNIQUEIDENTIFIER NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_users_default_gate FOREIGN KEY (default_gate_id) REFERENCES dbo.gates(id)
  );
END;

IF OBJECT_ID('dbo.visitors', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.visitors (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    first_name NVARCHAR(120) NOT NULL,
    last_name NVARCHAR(120) NOT NULL,
    company NVARCHAR(255) NOT NULL,
    phone_optional NVARCHAR(80) NULL,
    email_optional NVARCHAR(255) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.visits', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.visits (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    visitor_id UNIQUEIDENTIFIER NOT NULL,
    gate_id UNIQUEIDENTIFIER NOT NULL,
    host_name NVARCHAR(255) NOT NULL,
    host_department NVARCHAR(255) NOT NULL,
    purpose NVARCHAR(500) NOT NULL,
    location NVARCHAR(255) NULL,
    valid_from DATETIME2 NOT NULL,
    valid_until DATETIME2 NOT NULL,
    license_plate NVARCHAR(40) NULL,
    check_in_at DATETIME2 NULL,
    check_out_at DATETIME2 NULL,
    badge_number NVARCHAR(64) NULL,
    status NVARCHAR(32) NOT NULL,
    created_by UNIQUEIDENTIFIER NULL,
    created_via_public_form BIT NOT NULL DEFAULT 0,
    submitted_ip_address NVARCHAR(64) NULL,
    notes NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_visits_visitor FOREIGN KEY (visitor_id) REFERENCES dbo.visitors(id),
    CONSTRAINT fk_visits_gate FOREIGN KEY (gate_id) REFERENCES dbo.gates(id),
    CONSTRAINT fk_visits_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
  );
END;

IF OBJECT_ID('dbo.visits', 'U') IS NOT NULL AND COL_LENGTH('dbo.visits', 'license_plate') IS NULL
BEGIN
  ALTER TABLE dbo.visits ADD license_plate NVARCHAR(40) NULL;
END;

IF OBJECT_ID('dbo.site_maps', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.site_maps (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    name NVARCHAR(255) NOT NULL,
    file_path NVARCHAR(500) NOT NULL,
    is_active BIT NOT NULL DEFAULT 1,
    uploaded_by UNIQUEIDENTIFIER NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_site_maps_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES dbo.users(id)
  );
END;

IF OBJECT_ID('dbo.badge_text_templates', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.badge_text_templates (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    name NVARCHAR(120) NOT NULL,
    text_type NVARCHAR(80) NOT NULL,
    content NVARCHAR(MAX) NOT NULL,
    is_active BIT NOT NULL DEFAULT 1,
    updated_by UNIQUEIDENTIFIER NULL,
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_badge_templates_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users(id)
  );
END;

IF OBJECT_ID('dbo.audit_logs', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.audit_logs (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [user] NVARCHAR(255) NOT NULL,
    action NVARCHAR(120) NOT NULL,
    object_type NVARCHAR(120) NOT NULL,
    object_id NVARCHAR(120) NOT NULL,
    ip_address NVARCHAR(64) NULL,
    [timestamp] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.system_settings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.system_settings (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [key] NVARCHAR(120) NOT NULL UNIQUE,
    [value] NVARCHAR(MAX) NOT NULL,
    description NVARCHAR(500) NULL,
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
