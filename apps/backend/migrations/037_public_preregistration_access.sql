IF OBJECT_ID(N'dbo.public_visit_access_tokens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.public_visit_access_tokens (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_public_visit_access_tokens PRIMARY KEY DEFAULT NEWID(),
    visit_id UNIQUEIDENTIFIER NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME2 NOT NULL,
    revoked_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_public_visit_access_tokens_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_public_visit_access_tokens_visit FOREIGN KEY (visit_id) REFERENCES dbo.visits(id) ON DELETE CASCADE
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.public_visit_access_tokens')
    AND name = N'UX_public_visit_access_tokens_hash'
)
  CREATE UNIQUE INDEX UX_public_visit_access_tokens_hash
    ON dbo.public_visit_access_tokens(token_hash);

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.public_visit_access_tokens')
    AND name = N'IX_public_visit_access_tokens_visit'
)
  CREATE INDEX IX_public_visit_access_tokens_visit
    ON dbo.public_visit_access_tokens(visit_id, expires_at)
    INCLUDE (revoked_at);

IF COL_LENGTH(N'dbo.visits', N'public_recipient_updated_at') IS NULL
  ALTER TABLE dbo.visits ADD public_recipient_updated_at DATETIME2 NULL;
