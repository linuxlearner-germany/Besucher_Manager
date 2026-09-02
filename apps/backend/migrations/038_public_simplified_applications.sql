IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = N'public_simplified_application_reference_seq' AND schema_id = SCHEMA_ID(N'dbo'))
  CREATE SEQUENCE dbo.public_simplified_application_reference_seq AS BIGINT START WITH 1 INCREMENT BY 1;

IF OBJECT_ID(N'dbo.public_simplified_applications', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.public_simplified_applications (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_public_simplified_applications PRIMARY KEY DEFAULT NEWID(),
    public_reference NVARCHAR(32) NOT NULL,
    applicant_email NVARCHAR(255) NOT NULL,
    applicant_name NVARCHAR(255) NULL,
    applicant_organization NVARCHAR(255) NULL,
    applicant_note NVARCHAR(2000) NULL,
    status NVARCHAR(40) NOT NULL,
    email_verification_required BIT NOT NULL,
    email_verified_at DATETIME2 NULL,
    verification_mail_sent_at DATETIME2 NULL,
    submitted_at DATETIME2 NULL,
    decided_at DATETIME2 NULL,
    finalized_at DATETIME2 NULL,
    source NVARCHAR(40) NOT NULL CONSTRAINT df_public_simplified_applications_source DEFAULT N'public_simplified_excel',
    created_at DATETIME2 NOT NULL CONSTRAINT df_public_simplified_applications_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_public_simplified_applications_updated_at DEFAULT SYSUTCDATETIME(),
    [version] ROWVERSION NOT NULL,
    CONSTRAINT uq_public_simplified_applications_reference UNIQUE (public_reference),
    CONSTRAINT ck_public_simplified_applications_status CHECK (status IN (N'pending_email_verification', N'submitted', N'partially_approved', N'approved', N'rejected', N'cancelled'))
  );
END;

IF OBJECT_ID(N'dbo.public_simplified_application_entries', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.public_simplified_application_entries (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_public_simplified_application_entries PRIMARY KEY DEFAULT NEWID(),
    application_id UNIQUEIDENTIFIER NOT NULL,
    source_row_number INT NOT NULL,
    first_name NVARCHAR(120) NULL,
    last_name NVARCHAR(120) NULL,
    company NVARCHAR(255) NULL,
    nationality_code NCHAR(2) NULL,
    birth_date DATE NULL,
    phone NVARCHAR(80) NULL,
    email NVARCHAR(255) NULL,
    license_plate NVARCHAR(40) NULL,
    gate_id UNIQUEIDENTIFIER NOT NULL,
    host_name NVARCHAR(255) NULL,
    host_phone NVARCHAR(80) NULL,
    host_email NVARCHAR(255) NULL,
    host_department NVARCHAR(255) NULL,
    purpose NVARCHAR(500) NULL,
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    notes NVARCHAR(2000) NULL,
    status NVARCHAR(24) NOT NULL CONSTRAINT df_public_simplified_application_entries_status DEFAULT N'pending',
    rejection_reason NVARCHAR(1000) NULL,
    decided_by UNIQUEIDENTIFIER NULL,
    decided_at DATETIME2 NULL,
    created_visit_id UNIQUEIDENTIFIER NULL,
    created_visitor_id UNIQUEIDENTIFIER NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_public_simplified_application_entries_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_public_simplified_application_entries_updated_at DEFAULT SYSUTCDATETIME(),
    [version] ROWVERSION NOT NULL,
    CONSTRAINT fk_public_simplified_entries_application FOREIGN KEY (application_id) REFERENCES dbo.public_simplified_applications(id) ON DELETE CASCADE,
    CONSTRAINT fk_public_simplified_entries_gate FOREIGN KEY (gate_id) REFERENCES dbo.gates(id),
    CONSTRAINT fk_public_simplified_entries_decided_by FOREIGN KEY (decided_by) REFERENCES dbo.users(id),
    CONSTRAINT fk_public_simplified_entries_visit FOREIGN KEY (created_visit_id) REFERENCES dbo.visits(id),
    CONSTRAINT fk_public_simplified_entries_visitor FOREIGN KEY (created_visitor_id) REFERENCES dbo.visitors(id),
    CONSTRAINT uq_public_simplified_entries_row UNIQUE (application_id, source_row_number),
    CONSTRAINT ck_public_simplified_entries_status CHECK (status IN (N'pending', N'approved', N'rejected'))
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_public_simplified_entries_created_visit' AND object_id = OBJECT_ID(N'dbo.public_simplified_application_entries'))
  CREATE UNIQUE INDEX ux_public_simplified_entries_created_visit ON dbo.public_simplified_application_entries(created_visit_id) WHERE created_visit_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_public_simplified_applications_status_submitted' AND object_id = OBJECT_ID(N'dbo.public_simplified_applications'))
  CREATE INDEX ix_public_simplified_applications_status_submitted ON dbo.public_simplified_applications(status, submitted_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_public_simplified_applications_email' AND object_id = OBJECT_ID(N'dbo.public_simplified_applications'))
  CREATE INDEX ix_public_simplified_applications_email ON dbo.public_simplified_applications(applicant_email);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_public_simplified_entries_application_status' AND object_id = OBJECT_ID(N'dbo.public_simplified_application_entries'))
  CREATE INDEX ix_public_simplified_entries_application_status ON dbo.public_simplified_application_entries(application_id, status);

IF OBJECT_ID(N'dbo.public_simplified_application_verification_tokens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.public_simplified_application_verification_tokens (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_public_simplified_application_tokens PRIMARY KEY DEFAULT NEWID(),
    application_id UNIQUEIDENTIFIER NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME2 NOT NULL,
    used_at DATETIME2 NULL,
    revoked_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_public_simplified_application_tokens_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_public_simplified_tokens_application FOREIGN KEY (application_id) REFERENCES dbo.public_simplified_applications(id) ON DELETE CASCADE,
    CONSTRAINT uq_public_simplified_tokens_hash UNIQUE (token_hash)
  );
END;

IF OBJECT_ID(N'dbo.public_simplified_application_mail_outbox', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.public_simplified_application_mail_outbox (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_public_simplified_application_mail_outbox PRIMARY KEY DEFAULT NEWID(),
    application_id UNIQUEIDENTIFIER NOT NULL,
    event_key NVARCHAR(120) NOT NULL,
    mail_type NVARCHAR(40) NOT NULL,
    recipients_json NVARCHAR(MAX) NOT NULL,
    payload_json NVARCHAR(MAX) NOT NULL,
    attempts INT NOT NULL CONSTRAINT df_public_simplified_mail_attempts DEFAULT 0,
    sent_at DATETIME2 NULL,
    last_error NVARCHAR(500) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_public_simplified_mail_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_public_simplified_mail_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_public_simplified_mail_application FOREIGN KEY (application_id) REFERENCES dbo.public_simplified_applications(id) ON DELETE CASCADE,
    CONSTRAINT uq_public_simplified_mail_event UNIQUE (application_id, event_key)
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = N'public_xlsx_require_email_verification')
  INSERT INTO dbo.system_settings ([key], [value], description)
  VALUES (N'public_xlsx_require_email_verification', N'true', N'Öffentliche XLSX-Anträge erst nach E-Mail-Bestätigung an KSKdt weiterleiten');
