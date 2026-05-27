/* Field configuration MVP: system/custom field definitions + visit custom values */

IF OBJECT_ID('dbo.field_definitions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.field_definitions (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    field_key NVARCHAR(100) NOT NULL UNIQUE,
    label NVARCHAR(200) NOT NULL,
    field_type NVARCHAR(50) NOT NULL,
    section NVARCHAR(50) NOT NULL,
    is_system BIT NOT NULL DEFAULT 0,
    is_active BIT NOT NULL DEFAULT 1,
    show_in_public BIT NOT NULL DEFAULT 0,
    show_in_guard BIT NOT NULL DEFAULT 1,
    show_in_sibe BIT NOT NULL DEFAULT 1,
    show_on_badge BIT NOT NULL DEFAULT 0,
    required_public BIT NOT NULL DEFAULT 0,
    required_guard_checkin BIT NOT NULL DEFAULT 0,
    required_before_print BIT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 100,
    help_text NVARCHAR(500) NULL,
    options_json NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NULL
  );
END;

IF OBJECT_ID('dbo.visit_custom_field_values', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.visit_custom_field_values (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    visit_id UNIQUEIDENTIFIER NOT NULL,
    field_definition_id UNIQUEIDENTIFIER NOT NULL,
    value_text NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NULL,
    CONSTRAINT fk_visit_custom_field_values_visit FOREIGN KEY (visit_id) REFERENCES dbo.visits(id),
    CONSTRAINT fk_visit_custom_field_values_definition FOREIGN KEY (field_definition_id) REFERENCES dbo.field_definitions(id),
    CONSTRAINT uq_visit_custom_field_values UNIQUE (visit_id, field_definition_id)
  );
END;

IF OBJECT_ID('dbo.field_definitions', 'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_first_name')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visitor_first_name', 'Vorname', 'text', 'Besucher', 1, 1, 1, 1, 1, 1, 1, 1, 1, 10);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_last_name')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visitor_last_name', 'Nachname', 'text', 'Besucher', 1, 1, 1, 1, 1, 1, 1, 1, 1, 20);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_company')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visitor_company', 'Firma / Organisation', 'text', 'Besucher', 1, 1, 1, 1, 1, 1, 1, 1, 1, 30);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_birth_date')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visitor_birth_date', 'Geburtsdatum', 'date', 'Besucher', 1, 1, 1, 1, 1, 1, 0, 0, 0, 40);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_phone')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visitor_phone', 'Telefon Besucher', 'phone', 'Besucher', 1, 1, 1, 1, 1, 0, 0, 0, 0, 50);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_email')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visitor_email', 'E-Mail Besucher', 'email', 'Besucher', 1, 1, 1, 1, 1, 0, 0, 0, 0, 60);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_license_plate')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visitor_license_plate', 'Kennzeichen', 'text', 'Besucher', 1, 1, 1, 1, 1, 1, 0, 0, 0, 70);

  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_street')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visitor_street', 'Strasse', 'text', 'Adresse', 1, 1, 0, 1, 1, 1, 0, 1, 1, 100);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_house_number')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visitor_house_number', 'Hausnummer', 'text', 'Adresse', 1, 1, 0, 1, 1, 1, 0, 1, 1, 110);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_postal_code')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visitor_postal_code', 'PLZ', 'text', 'Adresse', 1, 1, 0, 1, 1, 1, 0, 1, 1, 120);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_city')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visitor_city', 'Wohnort', 'text', 'Adresse', 1, 1, 0, 1, 1, 1, 0, 1, 1, 130);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visitor_address')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visitor_address', 'Anschrift Freitext', 'textarea', 'Adresse', 1, 1, 0, 1, 1, 0, 0, 0, 0, 140);

  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'host_name')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('host_name', 'Ansprechpartner', 'text', 'Ansprechpartner', 1, 1, 1, 1, 1, 1, 1, 1, 1, 200);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'host_phone')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('host_phone', 'Ansprechpartner Telefon', 'phone', 'Ansprechpartner', 1, 1, 1, 1, 1, 1, 1, 1, 1, 210);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'host_email')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('host_email', 'Ansprechpartner E-Mail', 'email', 'Ansprechpartner', 1, 1, 1, 1, 1, 0, 0, 0, 0, 220);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'host_department')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('host_department', 'Abteilung / Bereich', 'text', 'Ansprechpartner', 1, 1, 0, 1, 1, 1, 0, 0, 0, 230);

  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visit_purpose')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visit_purpose', 'Besuchszweck', 'textarea', 'Besuch', 1, 1, 1, 1, 1, 1, 1, 1, 1, 300);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'valid_from')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('valid_from', 'Gueltig von', 'date', 'Besuch', 1, 1, 1, 1, 1, 1, 1, 1, 1, 310);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'valid_until')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('valid_until', 'Gueltig bis', 'date', 'Besuch', 1, 1, 1, 1, 1, 1, 1, 1, 1, 320);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'visit_note')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('visit_note', 'Bemerkung', 'textarea', 'Besuch', 1, 1, 1, 1, 1, 0, 0, 0, 0, 330);

  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'id_document_type')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order, options_json)
    VALUES ('id_document_type', 'Ausweisart', 'select', 'Ausweis', 1, 1, 0, 1, 1, 1, 0, 1, 1, 400, '[\"identity_card\",\"passport\",\"other\"]');
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'id_document_valid_until')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('id_document_valid_until', 'Ausweis gueltig bis', 'date', 'Ausweis', 1, 1, 0, 1, 1, 1, 0, 1, 1, 410);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'id_document_number')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('id_document_number', 'Ausweisnummer', 'text', 'Ausweis', 1, 1, 0, 1, 1, 1, 0, 1, 1, 420);
  IF NOT EXISTS (SELECT 1 FROM dbo.field_definitions WHERE field_key = 'id_document_issuing_place')
    INSERT INTO dbo.field_definitions (field_key, label, field_type, section, is_system, is_active, show_in_public, show_in_guard, show_in_sibe, show_on_badge, required_public, required_guard_checkin, required_before_print, sort_order)
    VALUES ('id_document_issuing_place', 'Ausstellungsort', 'text', 'Ausweis', 1, 1, 0, 1, 1, 1, 0, 1, 1, 430);
END;
