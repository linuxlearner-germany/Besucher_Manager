IF OBJECT_ID('dbo.barracks_areas', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.barracks_areas (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    name NVARCHAR(120) NOT NULL,
    description NVARCHAR(500) NULL,
    is_active BIT NOT NULL CONSTRAINT df_barracks_areas_active DEFAULT 1,
    sort_order INT NOT NULL CONSTRAINT df_barracks_areas_sort DEFAULT 100,
    created_at DATETIME2 NOT NULL CONSTRAINT df_barracks_areas_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_barracks_areas_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_barracks_areas_name UNIQUE (name)
  );
END;

IF COL_LENGTH('dbo.gates', 'barracks_area_id') IS NULL
  EXEC(N'ALTER TABLE dbo.gates ADD barracks_area_id UNIQUEIDENTIFIER NULL;');

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_gates_barracks_area')
  EXEC(N'ALTER TABLE dbo.gates ADD CONSTRAINT fk_gates_barracks_area FOREIGN KEY (barracks_area_id) REFERENCES dbo.barracks_areas(id);');

IF NOT EXISTS (SELECT 1 FROM dbo.barracks_areas)
  INSERT INTO dbo.barracks_areas(name, description, sort_order) VALUES(N'Standardbereich', N'Standardzuordnung für bestehende Wachen', 10);

EXEC(N'UPDATE dbo.gates
  SET barracks_area_id = (SELECT TOP 1 id FROM dbo.barracks_areas ORDER BY sort_order, name)
  WHERE barracks_area_id IS NULL;');

IF OBJECT_ID('dbo.simplified_registration_requests', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.simplified_registration_requests (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    request_number NVARCHAR(32) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    applicant_email NVARCHAR(255) NOT NULL,
    status NVARCHAR(32) NOT NULL CONSTRAINT df_simplified_requests_status DEFAULT 'pending',
    source_filename NVARCHAR(255) NULL,
    entry_count INT NOT NULL,
    submitted_ip_address NVARCHAR(64) NULL,
    user_agent NVARCHAR(500) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_simplified_requests_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_simplified_requests_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_simplified_requests_number UNIQUE(request_number),
    CONSTRAINT ck_simplified_requests_status CHECK(status IN ('pending','partially_approved','approved','rejected','completed')),
    CONSTRAINT ck_simplified_requests_entry_count CHECK(entry_count > 0)
  );
END;

IF OBJECT_ID('dbo.simplified_registration_request_number_seq', 'SO') IS NULL
  EXEC('CREATE SEQUENCE dbo.simplified_registration_request_number_seq AS BIGINT START WITH 1 INCREMENT BY 1');

IF OBJECT_ID('dbo.simplified_registration_entries', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.simplified_registration_entries (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    request_id UNIQUEIDENTIFIER NOT NULL,
    visitor_id UNIQUEIDENTIFIER NOT NULL,
    barracks_area_id UNIQUEIDENTIFIER NOT NULL,
    gate_id UNIQUEIDENTIFIER NULL,
    proposed_valid_from DATE NOT NULL,
    proposed_valid_until DATE NOT NULL,
    final_valid_from DATE NULL,
    final_valid_until DATE NULL,
    status NVARCHAR(32) NOT NULL CONSTRAINT df_simplified_entries_status DEFAULT 'pending',
    rejection_reason NVARCHAR(1000) NULL,
    license_plate NVARCHAR(40) NULL,
    host_name NVARCHAR(255) NULL,
    host_email NVARCHAR(255) NULL,
    host_phone NVARCHAR(80) NULL,
    host_department NVARCHAR(255) NULL,
    purpose NVARCHAR(500) NULL,
    notes NVARCHAR(4000) NULL,
    approved_by UNIQUEIDENTIFIER NULL,
    approved_at DATETIME2 NULL,
    rejected_by UNIQUEIDENTIFIER NULL,
    rejected_at DATETIME2 NULL,
    revoked_by UNIQUEIDENTIFIER NULL,
    revoked_at DATETIME2 NULL,
    version INT NOT NULL CONSTRAINT df_simplified_entries_version DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT df_simplified_entries_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT df_simplified_entries_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_simplified_entries_request FOREIGN KEY(request_id) REFERENCES dbo.simplified_registration_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_simplified_entries_visitor FOREIGN KEY(visitor_id) REFERENCES dbo.visitors(id),
    CONSTRAINT fk_simplified_entries_area FOREIGN KEY(barracks_area_id) REFERENCES dbo.barracks_areas(id),
    CONSTRAINT fk_simplified_entries_gate FOREIGN KEY(gate_id) REFERENCES dbo.gates(id),
    CONSTRAINT fk_simplified_entries_approved_by FOREIGN KEY(approved_by) REFERENCES dbo.users(id),
    CONSTRAINT fk_simplified_entries_rejected_by FOREIGN KEY(rejected_by) REFERENCES dbo.users(id),
    CONSTRAINT fk_simplified_entries_revoked_by FOREIGN KEY(revoked_by) REFERENCES dbo.users(id)
    ,CONSTRAINT ck_simplified_entries_status CHECK(status IN ('pending','approved','rejected','revoked'))
    ,CONSTRAINT ck_simplified_entries_proposed_dates CHECK(proposed_valid_until >= proposed_valid_from)
    ,CONSTRAINT ck_simplified_entries_final_dates CHECK((final_valid_from IS NULL AND final_valid_until IS NULL) OR (final_valid_from IS NOT NULL AND final_valid_until IS NOT NULL AND final_valid_until >= final_valid_from))
    ,CONSTRAINT ck_simplified_entries_version CHECK(version > 0)
  );
END;

IF OBJECT_ID('dbo.simplified_nationality_notification_deliveries', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.simplified_nationality_notification_deliveries (
    entry_id UNIQUEIDENTIFIER NOT NULL,
    user_id UNIQUEIDENTIFIER NOT NULL,
    country_code NCHAR(2) NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_simplified_notifications_created DEFAULT SYSUTCDATETIME(),
    sent_at DATETIME2 NULL,
    failed_at DATETIME2 NULL,
    CONSTRAINT pk_simplified_notifications PRIMARY KEY(entry_id, user_id),
    CONSTRAINT fk_simplified_notifications_entry FOREIGN KEY(entry_id) REFERENCES dbo.simplified_registration_entries(id) ON DELETE CASCADE,
    CONSTRAINT fk_simplified_notifications_user FOREIGN KEY(user_id) REFERENCES dbo.users(id)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_simplified_requests_status_created' AND object_id = OBJECT_ID('dbo.simplified_registration_requests'))
  CREATE INDEX ix_simplified_requests_status_created ON dbo.simplified_registration_requests(status, created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_simplified_entries_request' AND object_id = OBJECT_ID('dbo.simplified_registration_entries'))
  CREATE INDEX ix_simplified_entries_request ON dbo.simplified_registration_entries(request_id, status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_simplified_entries_visitor' AND object_id = OBJECT_ID('dbo.simplified_registration_entries'))
  CREATE INDEX ix_simplified_entries_visitor ON dbo.simplified_registration_entries(visitor_id, status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_simplified_entries_scope_validity' AND object_id = OBJECT_ID('dbo.simplified_registration_entries'))
  CREATE INDEX ix_simplified_entries_scope_validity ON dbo.simplified_registration_entries(barracks_area_id, gate_id, status, final_valid_from, final_valid_until);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_gates_barracks_area' AND object_id = OBJECT_ID('dbo.gates'))
  EXEC(N'CREATE INDEX ix_gates_barracks_area ON dbo.gates(barracks_area_id, is_active);');
