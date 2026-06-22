IF OBJECT_ID('dbo.field_definitions', 'U') IS NOT NULL
BEGIN
  UPDATE dbo.field_definitions
  SET
    label = 'Gültig von',
    updated_at = SYSUTCDATETIME()
  WHERE field_key = 'valid_from';

  UPDATE dbo.field_definitions
  SET
    label = 'Gültig bis',
    updated_at = SYSUTCDATETIME()
  WHERE field_key = 'valid_until';

  UPDATE dbo.field_definitions
  SET
    is_active = 1,
    show_in_public = 1,
    show_in_guard = 1,
    show_in_sibe = 1,
    show_on_badge = 1,
    required_public = 1,
    required_guard_checkin = 1,
    required_before_print = 1,
    updated_at = SYSUTCDATETIME()
  WHERE field_key = 'id_document_type';

  UPDATE dbo.field_definitions
  SET
    label = 'Ausweis gültig bis',
    is_active = 1,
    show_in_public = 1,
    show_in_guard = 1,
    show_in_sibe = 1,
    show_on_badge = 1,
    required_public = 1,
    required_guard_checkin = 1,
    required_before_print = 1,
    updated_at = SYSUTCDATETIME()
  WHERE field_key = 'id_document_valid_until';

  UPDATE dbo.field_definitions
  SET
    is_active = 1,
    show_in_public = 1,
    show_in_guard = 1,
    show_in_sibe = 1,
    show_on_badge = 1,
    required_public = 1,
    required_guard_checkin = 1,
    required_before_print = 1,
    updated_at = SYSUTCDATETIME()
  WHERE field_key = 'id_document_number';

  UPDATE dbo.field_definitions
  SET
    is_active = 0,
    show_in_public = 0,
    show_in_guard = 0,
    show_in_sibe = 0,
    show_on_badge = 0,
    required_public = 0,
    required_guard_checkin = 0,
    required_before_print = 0,
    updated_at = SYSUTCDATETIME()
  WHERE field_key = 'id_document_issuing_place';
END;

IF OBJECT_ID('dbo.users', 'U') IS NOT NULL
BEGIN
  UPDATE dbo.users
  SET
    gate_id = NULL,
    default_gate_id = NULL,
    updated_at = SYSUTCDATETIME()
  WHERE role = 'guard';
END;
