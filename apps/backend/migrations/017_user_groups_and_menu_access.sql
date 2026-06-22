IF OBJECT_ID(N'dbo.user_groups', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_groups (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL,
    group_name NVARCHAR(120) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_user_groups_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX ux_user_groups_user_group
    ON dbo.user_groups(user_id, group_name);
END;

IF OBJECT_ID(N'dbo.user_menu_access', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_menu_access (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL,
    menu_key NVARCHAR(80) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_user_menu_access_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX ux_user_menu_access_user_menu
    ON dbo.user_menu_access(user_id, menu_key);
END;
