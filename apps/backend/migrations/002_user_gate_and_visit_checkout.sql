IF COL_LENGTH('dbo.users', 'gate_id') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD gate_id UNIQUEIDENTIFIER NULL;
END;

IF COL_LENGTH('dbo.users', 'gate_id') IS NOT NULL AND COL_LENGTH('dbo.users', 'default_gate_id') IS NOT NULL
BEGIN
  EXEC sp_executesql N'
    UPDATE dbo.users
    SET gate_id = default_gate_id
    WHERE gate_id IS NULL AND default_gate_id IS NOT NULL;
  ';
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.foreign_keys
  WHERE name = 'fk_users_gate'
)
AND COL_LENGTH('dbo.users', 'gate_id') IS NOT NULL
BEGIN
  EXEC sp_executesql N'
    ALTER TABLE dbo.users
    ADD CONSTRAINT fk_users_gate FOREIGN KEY (gate_id) REFERENCES dbo.gates(id);
  ';
END;

IF COL_LENGTH('dbo.visits', 'signed_by_host_confirmed') IS NULL
BEGIN
  ALTER TABLE dbo.visits
  ADD signed_by_host_confirmed BIT NOT NULL CONSTRAINT df_visits_signed_by_host_confirmed DEFAULT 0;
END;

IF COL_LENGTH('dbo.visits', 'checkout_note') IS NULL
BEGIN
  ALTER TABLE dbo.visits
  ADD checkout_note NVARCHAR(MAX) NULL;
END;

IF NOT EXISTS (
  SELECT 1
  FROM dbo.gates
  WHERE name = 'Hauptwache'
)
BEGIN
  INSERT INTO dbo.gates (
    name,
    description,
    location,
    is_active,
    sort_order
  )
  VALUES (
    'Hauptwache',
    'Standard-Wache',
    'Werk / Eingang',
    1,
    10
  );
END;
