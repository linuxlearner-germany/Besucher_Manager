IF COL_LENGTH('dbo.visits', 'client_request_id') IS NULL
BEGIN
  ALTER TABLE dbo.visits ADD client_request_id NVARCHAR(64) NULL;
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'ux_visits_client_request_id'
    AND object_id = OBJECT_ID('dbo.visits')
)
BEGIN
  EXEC(N'
    CREATE UNIQUE INDEX ux_visits_client_request_id
      ON dbo.visits (client_request_id)
      WHERE client_request_id IS NOT NULL;
  ');
END;
