IF OBJECT_ID(N'dbo.field_definitions', N'U') IS NOT NULL
BEGIN
  UPDATE dbo.field_definitions
  SET
    required_public = 0,
    updated_at = SYSUTCDATETIME()
  WHERE required_public = 1;
END;
