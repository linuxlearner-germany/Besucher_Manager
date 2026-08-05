IF OBJECT_ID('dbo.system_settings', 'U') IS NOT NULL
BEGIN
  UPDATE dbo.system_settings
  SET description = 'Zentral angezeigte DATAV-Nummer (Buchstaben und Zahlen)'
  WHERE [key] = 'security_number';
END;
