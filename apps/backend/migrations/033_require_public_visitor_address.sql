IF OBJECT_ID('dbo.field_definitions', 'U') IS NOT NULL
BEGIN
  UPDATE dbo.field_definitions
  SET
    is_active = 1,
    show_in_public = 1,
    required_public = 1,
    updated_at = SYSUTCDATETIME()
  WHERE field_key IN (
    N'visitor_street',
    N'visitor_house_number',
    N'visitor_postal_code',
    N'visitor_city'
  );
END;
