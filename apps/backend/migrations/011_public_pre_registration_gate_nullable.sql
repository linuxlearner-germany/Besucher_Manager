/*
  Public pre-registrations are no longer tied to a fixed gate.
  New visits from the public form may remain unassigned until check-in.
*/

IF OBJECT_ID('dbo.visits', 'U') IS NOT NULL
AND COL_LENGTH('dbo.visits', 'gate_id') IS NOT NULL
BEGIN
  ALTER TABLE dbo.visits ALTER COLUMN gate_id UNIQUEIDENTIFIER NULL;
END;
