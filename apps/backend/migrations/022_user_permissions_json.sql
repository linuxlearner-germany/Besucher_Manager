IF OBJECT_ID('dbo.users', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.users', 'permissions_json') IS NULL
    ALTER TABLE dbo.users ADD permissions_json NVARCHAR(MAX) NULL;
END;
