IF COL_LENGTH('dbo.visits', 'returned_badge_number') IS NULL
BEGIN
  ALTER TABLE dbo.visits ADD returned_badge_number NVARCHAR(64) NULL;
END;

IF COL_LENGTH('dbo.visits', 'returned_badge_number_checked_at') IS NULL
BEGIN
  ALTER TABLE dbo.visits ADD returned_badge_number_checked_at DATETIME2 NULL;
END;

IF COL_LENGTH('dbo.visits', 'returned_badge_number_checked_by') IS NULL
BEGIN
  ALTER TABLE dbo.visits ADD returned_badge_number_checked_by UNIQUEIDENTIFIER NULL;
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.foreign_keys
  WHERE name = 'fk_visits_returned_badge_checked_by'
)
AND COL_LENGTH('dbo.visits', 'returned_badge_number_checked_by') IS NOT NULL
BEGIN
  ALTER TABLE dbo.visits
  ADD CONSTRAINT fk_visits_returned_badge_checked_by
  FOREIGN KEY (returned_badge_number_checked_by) REFERENCES dbo.users(id);
END;

IF OBJECT_ID('dbo.visits', 'U') IS NOT NULL
BEGIN
  UPDATE dbo.visits
  SET badge_number = CONCAT('B-LEGACY-', UPPER(LEFT(CONVERT(NVARCHAR(36), id), 8)))
  WHERE badge_number IS NULL OR LTRIM(RTRIM(badge_number)) = '';
END;
