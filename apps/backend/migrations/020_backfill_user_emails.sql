IF OBJECT_ID('dbo.users', 'U') IS NOT NULL AND COL_LENGTH('dbo.users', 'user_email') IS NOT NULL
BEGIN
  UPDATE dbo.users
  SET
    user_email = LOWER(REPLACE(LTRIM(RTRIM(username)), ' ', '')) + '@wiweb.test',
    updated_at = SYSUTCDATETIME()
  WHERE role <> 'guard'
    AND (user_email IS NULL OR LTRIM(RTRIM(user_email)) = '');
END;
