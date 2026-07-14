IF OBJECT_ID('dbo.badge_text_templates', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.badge_text_templates', 'custom_heading') IS NULL
    ALTER TABLE dbo.badge_text_templates ADD custom_heading NVARCHAR(120) NULL;

  IF COL_LENGTH('dbo.badge_text_templates', 'sort_order') IS NULL
    ALTER TABLE dbo.badge_text_templates ADD sort_order INT NOT NULL CONSTRAINT DF_badge_text_templates_sort_order DEFAULT 0;

  EXEC(N'
    UPDATE dbo.badge_text_templates
    SET sort_order = CASE text_type
      WHEN ''security_notice'' THEN 10
      WHEN ''photo_ban'' THEN 20
      WHEN ''signature_notice'' THEN 30
      WHEN ''visitor_notice'' THEN 40
      WHEN ''footer'' THEN 50
      WHEN ''custom'' THEN 100
      ELSE CASE WHEN sort_order = 0 THEN 900 ELSE sort_order END
    END
    WHERE sort_order = 0 OR sort_order IS NULL;
  ');

  EXEC(N'
    UPDATE dbo.badge_text_templates
    SET name = CASE text_type
      WHEN ''security_notice'' THEN ''Sicherheitshinweise''
      WHEN ''photo_ban'' THEN ''Fotografierverbot''
      WHEN ''signature_notice'' THEN ''Rückgabe und Unterschrift''
      WHEN ''visitor_notice'' THEN ''Hinweis für Besucher''
      WHEN ''footer'' THEN ''Footer''
      ELSE name
    END
    WHERE text_type IN (''security_notice'', ''photo_ban'', ''signature_notice'', ''visitor_notice'', ''footer'');
  ');

  EXEC(N'
    UPDATE dbo.badge_text_templates
    SET custom_heading = NULL
    WHERE text_type <> ''custom'';
  ');

  EXEC(N'
    IF NOT EXISTS (
      SELECT 1
      FROM dbo.badge_text_templates
      WHERE text_type = ''visitor_notice''
    )
    BEGIN
      INSERT INTO dbo.badge_text_templates (name, text_type, custom_heading, content, is_active, sort_order)
      VALUES (
        ''Hinweis für Besucher'',
        ''visitor_notice'',
        NULL,
        ''Besucherschein und ausgegebene Unterlagen oder Ausweise bei Aufforderung jederzeit vorzeigen.'',
        1,
        40
      );
    END;
  ');
END;
