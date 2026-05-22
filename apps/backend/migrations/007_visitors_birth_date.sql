IF OBJECT_ID('dbo.visitors', 'U') IS NOT NULL AND COL_LENGTH('dbo.visitors', 'birth_date') IS NULL
BEGIN
  ALTER TABLE dbo.visitors ADD birth_date DATE NULL;
END;
