IF OBJECT_ID('dbo.users', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.users', 'user_email') IS NULL
    ALTER TABLE dbo.users ADD user_email NVARCHAR(255) NULL;
END;
