IF OBJECT_ID('dbo.system_settings', 'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.system_settings WHERE [key] = 'security_number')
BEGIN
  INSERT INTO dbo.system_settings ([key], [value], description)
  VALUES ('security_number', 'BM2026', 'Zentral angezeigte Sicherheitsnummer (Buchstaben und Zahlen)');
END;
