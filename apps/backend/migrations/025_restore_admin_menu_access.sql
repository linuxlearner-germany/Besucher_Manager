/*
  Migration 023 added the text menu for admins and KasKdt, but an admin
  account must retain access to the complete administration navigation.
  Add missing admin menu entries idempotently for existing installations.
*/
IF OBJECT_ID(N'dbo.user_menu_access', N'U') IS NOT NULL
BEGIN
  INSERT INTO dbo.user_menu_access (user_id, menu_key)
  SELECT u.id, menu_keys.menu_key
  FROM dbo.users u
  CROSS JOIN (VALUES
    (N'voranmeldung'),
    (N'wache'),
    (N'import'),
    (N'admin'),
    (N'sibe'),
    (N'kaskdt'),
    (N'texte')
  ) AS menu_keys(menu_key)
  WHERE u.role = N'admin'
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.user_menu_access uma
      WHERE uma.user_id = u.id
        AND uma.menu_key = menu_keys.menu_key
    );
END;
