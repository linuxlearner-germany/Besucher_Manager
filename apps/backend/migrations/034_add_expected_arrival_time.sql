IF COL_LENGTH('dbo.visits', 'expected_arrival_time') IS NULL
BEGIN
  ALTER TABLE dbo.visits ADD expected_arrival_time TIME(0) NULL;
END;
