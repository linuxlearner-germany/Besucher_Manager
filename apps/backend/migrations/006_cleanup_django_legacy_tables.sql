IF OBJECT_ID(N'dbo.auth_user_user_permissions', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.auth_user_user_permissions;
END;

IF OBJECT_ID(N'dbo.auth_user_groups', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.auth_user_groups;
END;

IF OBJECT_ID(N'dbo.auth_group_permissions', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.auth_group_permissions;
END;

IF OBJECT_ID(N'dbo.django_admin_log', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.django_admin_log;
END;

IF OBJECT_ID(N'dbo.django_session', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.django_session;
END;

IF OBJECT_ID(N'dbo.django_migrations', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.django_migrations;
END;

IF OBJECT_ID(N'dbo.auth_permission', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.auth_permission;
END;

IF OBJECT_ID(N'dbo.auth_group', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.auth_group;
END;

IF OBJECT_ID(N'dbo.auth_user', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.auth_user;
END;

IF OBJECT_ID(N'dbo.core_staffprofile', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.core_staffprofile;
END;

IF OBJECT_ID(N'dbo.core_auditlog', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.core_auditlog;
END;

IF OBJECT_ID(N'dbo.core_badgetexttemplate', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.core_badgetexttemplate;
END;

IF OBJECT_ID(N'dbo.core_sitemap', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.core_sitemap;
END;

IF OBJECT_ID(N'dbo.core_systemsetting', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.core_systemsetting;
END;

IF OBJECT_ID(N'dbo.visits_visit', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.visits_visit;
END;

IF OBJECT_ID(N'dbo.visits_visitor', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.visits_visitor;
END;

IF OBJECT_ID(N'dbo.core_gate', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.core_gate;
END;

IF OBJECT_ID(N'dbo.django_content_type', N'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.django_content_type;
END;
