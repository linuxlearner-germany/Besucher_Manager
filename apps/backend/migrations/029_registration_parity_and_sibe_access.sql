IF OBJECT_ID(N'dbo.field_definitions', N'U') IS NOT NULL
BEGIN
  UPDATE dbo.field_definitions
  SET show_in_public = 1, updated_at = SYSUTCDATETIME()
  WHERE field_key IN (
    N'visitor_street',
    N'visitor_house_number',
    N'visitor_postal_code',
    N'visitor_city'
  );
END;

IF OBJECT_ID(N'dbo.user_menu_access', N'U') IS NOT NULL
BEGIN
  INSERT INTO dbo.user_menu_access (user_id, menu_key)
  SELECT users.id, menu_keys.menu_key
  FROM dbo.users AS users
  CROSS JOIN (VALUES
    (N'sibe'),
    (N'import'),
    (N'laenderbenachrichtigungen')
  ) AS menu_keys(menu_key)
  WHERE users.role = N'sibe'
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.user_menu_access AS access
      WHERE access.user_id = users.id
        AND access.menu_key = menu_keys.menu_key
    );
END;
