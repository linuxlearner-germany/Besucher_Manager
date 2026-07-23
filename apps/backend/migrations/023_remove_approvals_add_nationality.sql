/* Run the documented SQL backup before applying this destructive migration. */
IF OBJECT_ID('dbo.visitors', 'U') IS NOT NULL AND COL_LENGTH('dbo.visitors', 'nationality_code') IS NULL
  ALTER TABLE dbo.visitors ADD nationality_code NCHAR(2) NULL;

IF OBJECT_ID('dbo.user_nationality_subscriptions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_nationality_subscriptions (
    user_id UNIQUEIDENTIFIER NOT NULL,
    country_code NCHAR(2) NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_user_nationality_subscriptions_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT pk_user_nationality_subscriptions PRIMARY KEY (user_id, country_code),
    CONSTRAINT fk_user_nationality_subscriptions_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
  );
END;

IF OBJECT_ID('dbo.nationality_notification_deliveries', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.nationality_notification_deliveries (
    visit_id UNIQUEIDENTIFIER NOT NULL,
    user_id UNIQUEIDENTIFIER NOT NULL,
    country_code NCHAR(2) NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT df_nationality_notification_deliveries_created DEFAULT SYSUTCDATETIME(),
    sent_at DATETIME2 NULL,
    failed_at DATETIME2 NULL,
    CONSTRAINT pk_nationality_notification_deliveries PRIMARY KEY (visit_id, user_id),
    CONSTRAINT fk_nationality_notification_deliveries_visit FOREIGN KEY (visit_id) REFERENCES dbo.visits(id) ON DELETE CASCADE,
    CONSTRAINT fk_nationality_notification_deliveries_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
END;

IF OBJECT_ID('dbo.field_definitions', 'U') IS NOT NULL
BEGIN
  IF OBJECT_ID('dbo.visit_custom_field_values', 'U') IS NOT NULL
    DELETE FROM dbo.visit_custom_field_values
    WHERE field_definition_id IN (SELECT id FROM dbo.field_definitions WHERE is_system = 0);
  DELETE FROM dbo.field_definitions WHERE is_system = 0;

  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_nationality')
    INSERT INTO dbo.field_definitions (
      field_key, label, field_type, section, is_system, is_active,
      show_in_public, show_in_guard, show_in_sibe, show_on_badge,
      required_public, required_guard_checkin, required_before_print, sort_order
    ) VALUES (
      'visitor_nationality', 'Nationalität', 'select', 'Besucher', 1, 1,
      1, 1, 1, 1, 1, 1, 1, 35
    );

  UPDATE dbo.field_definitions
  SET options_json = '["identity_card","passport","service_id","other"]', updated_at = SYSUTCDATETIME()
  WHERE field_key = 'id_document_type';
END;

IF OBJECT_ID('dbo.system_settings', 'U') IS NOT NULL
  DELETE FROM dbo.system_settings WHERE [key] IN ('sibe_approval_required', 'mail_relay_approval_to');

IF OBJECT_ID('dbo.users', 'U') IS NOT NULL
BEGIN
  UPDATE dbo.users
  SET permissions_json = JSON_MODIFY(
    JSON_MODIFY(
      JSON_MODIFY(
        JSON_MODIFY(permissions_json, '$.texts.manage', CAST(COALESCE(JSON_VALUE(permissions_json, '$.admin.texts'), 'false') AS BIT)),
        '$.admin.texts',
        NULL
      ),
      '$.approvals',
      NULL
    ),
    '$.menu.approvals',
    NULL
  )
  WHERE ISJSON(permissions_json) = 1;
END;

IF OBJECT_ID('dbo.user_menu_access', 'U') IS NOT NULL
BEGIN
  DELETE FROM dbo.user_menu_access WHERE menu_key = 'genehmigung';
  INSERT INTO dbo.user_menu_access (user_id, menu_key)
  SELECT u.id, 'texte'
  FROM dbo.users u
  WHERE u.role IN ('admin', 'kaskdt')
    AND NOT EXISTS (
      SELECT 1 FROM dbo.user_menu_access uma
      WHERE uma.user_id = u.id AND uma.menu_key = 'texte'
    );
END;

IF OBJECT_ID('dbo.visits', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.visits', 'approval_decided_by') IS NOT NULL
  BEGIN
    DECLARE @approvalFk NVARCHAR(128);
    SELECT TOP 1 @approvalFk = fk.name
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE fk.parent_object_id = OBJECT_ID('dbo.visits') AND c.name = 'approval_decided_by';
    IF @approvalFk IS NOT NULL EXEC('ALTER TABLE dbo.visits DROP CONSTRAINT [' + @approvalFk + ']');
  END;
  DECLARE @approvalDefault NVARCHAR(128);
  SELECT TOP 1 @approvalDefault = dc.name
  FROM sys.default_constraints dc
  JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID('dbo.visits')
    AND c.name IN ('approval_status', 'approval_note', 'approval_decided_by', 'approval_decided_at');
  WHILE @approvalDefault IS NOT NULL
  BEGIN
    EXEC('ALTER TABLE dbo.visits DROP CONSTRAINT [' + @approvalDefault + ']');
    SET @approvalDefault = NULL;
    SELECT TOP 1 @approvalDefault = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.visits')
      AND c.name IN ('approval_status', 'approval_note', 'approval_decided_by', 'approval_decided_at');
  END;
  IF COL_LENGTH('dbo.visits', 'approval_status') IS NOT NULL ALTER TABLE dbo.visits DROP COLUMN approval_status;
  IF COL_LENGTH('dbo.visits', 'approval_note') IS NOT NULL ALTER TABLE dbo.visits DROP COLUMN approval_note;
  IF COL_LENGTH('dbo.visits', 'approval_decided_by') IS NOT NULL ALTER TABLE dbo.visits DROP COLUMN approval_decided_by;
  IF COL_LENGTH('dbo.visits', 'approval_decided_at') IS NOT NULL ALTER TABLE dbo.visits DROP COLUMN approval_decided_at;
END;

IF OBJECT_ID('dbo.audit_logs', 'U') IS NOT NULL
  DELETE FROM dbo.audit_logs
  WHERE action IN ('VISIT_APPROVED', 'VISIT_REJECTED')
     OR metadata_json LIKE '%approval_status%';

IF OBJECT_ID('dbo.error_logs', 'U') IS NOT NULL
  DELETE FROM dbo.error_logs
  WHERE error_code LIKE '%APPROVAL%'
     OR message LIKE '%Freigabe%';
