IF OBJECT_ID('dbo.visitors', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.visitors', 'visitor_street') IS NULL
    ALTER TABLE dbo.visitors ADD visitor_street NVARCHAR(255) NULL;
  IF COL_LENGTH('dbo.visitors', 'visitor_house_number') IS NULL
    ALTER TABLE dbo.visitors ADD visitor_house_number NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.visitors', 'visitor_postal_code') IS NULL
    ALTER TABLE dbo.visitors ADD visitor_postal_code NVARCHAR(20) NULL;
  IF COL_LENGTH('dbo.visitors', 'visitor_city') IS NULL
    ALTER TABLE dbo.visitors ADD visitor_city NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.visitors', 'visitor_address') IS NULL
    ALTER TABLE dbo.visitors ADD visitor_address NVARCHAR(500) NULL;

  IF COL_LENGTH('dbo.visitors', 'id_document_type') IS NULL
    ALTER TABLE dbo.visitors ADD id_document_type NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.visitors', 'id_document_valid_until') IS NULL
    ALTER TABLE dbo.visitors ADD id_document_valid_until DATE NULL;
  IF COL_LENGTH('dbo.visitors', 'id_document_number') IS NULL
    ALTER TABLE dbo.visitors ADD id_document_number NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.visitors', 'id_document_issuing_place') IS NULL
    ALTER TABLE dbo.visitors ADD id_document_issuing_place NVARCHAR(255) NULL;
END;

IF OBJECT_ID('dbo.visits', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.visits', 'visit_purpose_type') IS NULL
    ALTER TABLE dbo.visits ADD visit_purpose_type NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.visits', 'visit_company_order') IS NULL
    ALTER TABLE dbo.visits ADD visit_company_order NVARCHAR(500) NULL;
  IF COL_LENGTH('dbo.visits', 'host_unit') IS NULL
    ALTER TABLE dbo.visits ADD host_unit NVARCHAR(255) NULL;
  IF COL_LENGTH('dbo.visits', 'host_building') IS NULL
    ALTER TABLE dbo.visits ADD host_building NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.visits', 'host_room') IS NULL
    ALTER TABLE dbo.visits ADD host_room NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.visits', 'host_extension') IS NULL
    ALTER TABLE dbo.visits ADD host_extension NVARCHAR(80) NULL;

  IF COL_LENGTH('dbo.visits', 'visit_end_type') IS NULL
    ALTER TABLE dbo.visits ADD visit_end_type NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.visits', 'forwarded_to_note') IS NULL
    ALTER TABLE dbo.visits ADD forwarded_to_note NVARCHAR(500) NULL;

  IF COL_LENGTH('dbo.visits', 'device_photo_app') IS NULL
    ALTER TABLE dbo.visits ADD device_photo_app BIT NULL;
  IF COL_LENGTH('dbo.visits', 'device_film_app') IS NULL
    ALTER TABLE dbo.visits ADD device_film_app BIT NULL;
  IF COL_LENGTH('dbo.visits', 'device_video_camera') IS NULL
    ALTER TABLE dbo.visits ADD device_video_camera BIT NULL;
  IF COL_LENGTH('dbo.visits', 'device_manufacturer') IS NULL
    ALTER TABLE dbo.visits ADD device_manufacturer NVARCHAR(255) NULL;
  IF COL_LENGTH('dbo.visits', 'device_serial_number') IS NULL
    ALTER TABLE dbo.visits ADD device_serial_number NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.visits', 'device_accessories') IS NULL
    ALTER TABLE dbo.visits ADD device_accessories NVARCHAR(500) NULL;
  IF COL_LENGTH('dbo.visits', 'device_deposit_note') IS NULL
    ALTER TABLE dbo.visits ADD device_deposit_note NVARCHAR(500) NULL;
  IF COL_LENGTH('dbo.visits', 'device_return_confirmed') IS NULL
    ALTER TABLE dbo.visits ADD device_return_confirmed BIT NULL;
  IF COL_LENGTH('dbo.visits', 'device_returned_at') IS NULL
    ALTER TABLE dbo.visits ADD device_returned_at DATETIME2 NULL;
  IF COL_LENGTH('dbo.visits', 'device_returned_by') IS NULL
    ALTER TABLE dbo.visits ADD device_returned_by UNIQUEIDENTIFIER NULL;

  IF COL_LENGTH('dbo.visits', 'check_in_by') IS NULL
    ALTER TABLE dbo.visits ADD check_in_by UNIQUEIDENTIFIER NULL;
  IF COL_LENGTH('dbo.visits', 'check_out_by') IS NULL
    ALTER TABLE dbo.visits ADD check_out_by UNIQUEIDENTIFIER NULL;
END;
