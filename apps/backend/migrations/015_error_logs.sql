IF OBJECT_ID('dbo.error_logs', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.error_logs (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [level] NVARCHAR(16) NOT NULL DEFAULT 'error',
    error_code NVARCHAR(120) NOT NULL,
    [message] NVARCHAR(MAX) NOT NULL,
    request_path NVARCHAR(500) NULL,
    request_method NVARCHAR(16) NULL,
    ip_address NVARCHAR(64) NULL,
    user_agent NVARCHAR(500) NULL,
    user_name NVARCHAR(255) NULL,
    stack_trace NVARCHAR(MAX) NULL,
    metadata_json NVARCHAR(MAX) NULL,
    [timestamp] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
