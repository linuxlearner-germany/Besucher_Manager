IF COL_LENGTH(N'dbo.public_simplified_applications', N'client_request_id') IS NULL
  ALTER TABLE dbo.public_simplified_applications ADD client_request_id UNIQUEIDENTIFIER NULL;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'ux_public_simplified_applications_client_request'
    AND object_id = OBJECT_ID(N'dbo.public_simplified_applications')
)
  EXEC(N'CREATE UNIQUE INDEX ux_public_simplified_applications_client_request
    ON dbo.public_simplified_applications(client_request_id)
    WHERE client_request_id IS NOT NULL;');
