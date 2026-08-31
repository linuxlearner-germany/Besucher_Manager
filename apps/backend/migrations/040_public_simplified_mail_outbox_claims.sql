IF COL_LENGTH(N'dbo.public_simplified_application_mail_outbox', N'claim_token') IS NULL
  ALTER TABLE dbo.public_simplified_application_mail_outbox ADD claim_token UNIQUEIDENTIFIER NULL;

IF COL_LENGTH(N'dbo.public_simplified_application_mail_outbox', N'claim_expires_at') IS NULL
  ALTER TABLE dbo.public_simplified_application_mail_outbox ADD claim_expires_at DATETIME2 NULL;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'ix_public_simplified_mail_delivery_claim'
    AND object_id = OBJECT_ID(N'dbo.public_simplified_application_mail_outbox')
)
  CREATE INDEX ix_public_simplified_mail_delivery_claim
    ON dbo.public_simplified_application_mail_outbox(application_id, sent_at, claim_expires_at, created_at);
