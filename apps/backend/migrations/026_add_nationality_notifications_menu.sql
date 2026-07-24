/* Give existing administrators and SiBe users the dedicated notification menu. */
IF OBJECT_ID(N'dbo.user_menu_access', N'U') IS NOT NULL
BEGIN
  INSERT INTO dbo.user_menu_access (user_id, menu_key)
  SELECT u.id, N'laenderbenachrichtigungen'
  FROM dbo.users u
  WHERE u.role IN (N'admin', N'sibe')
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.user_menu_access uma
      WHERE uma.user_id = u.id
        AND uma.menu_key = N'laenderbenachrichtigungen'
    );
END;
