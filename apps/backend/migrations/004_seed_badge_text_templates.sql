IF OBJECT_ID('dbo.badge_text_templates', 'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM dbo.badge_text_templates
    WHERE text_type = 'security_notice'
  )
  BEGIN
    INSERT INTO dbo.badge_text_templates (name, text_type, content, is_active)
    VALUES (
      'Sicherheitshinweis',
      'security_notice',
      'Den Anweisungen des Personals ist Folge zu leisten. Der Besucherschein ist sichtbar zu tragen.',
      1
    );
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.badge_text_templates
    WHERE text_type = 'photo_ban'
  )
  BEGIN
    INSERT INTO dbo.badge_text_templates (name, text_type, content, is_active)
    VALUES (
      'Fotografierverbot',
      'photo_ban',
      'Fotografieren und Filmen auf dem Gelaende ist verboten.',
      1
    );
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.badge_text_templates
    WHERE text_type = 'signature_notice'
  )
  BEGIN
    INSERT INTO dbo.badge_text_templates (name, text_type, content, is_active)
    VALUES (
      'Unterschriftshinweis',
      'signature_notice',
      'Vor Ausfahrt / Verlassen des Gelaendes durch den Ansprechpartner zu unterschreiben.',
      1
    );
  END;
END;
