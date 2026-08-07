IF OBJECT_ID('dbo.field_definitions', 'U') IS NOT NULL
BEGIN
  UPDATE dbo.field_definitions
  SET
    required_public = 0,
    updated_at = SYSUTCDATETIME()
  WHERE field_key IN (
    N'visitor_street',
    N'visitor_house_number',
    N'visitor_postal_code',
    N'visitor_city',
    N'visitor_birth_date',
    N'id_document_type',
    N'id_document_valid_until',
    N'id_document_number'
  );
END;
