DELETE FROM dbo.error_logs
WHERE error_code = 'TEST_ERROR_LOG'
   OR [message] LIKE 'Testeintrag%'
   OR ISNULL(metadata_json, '') LIKE '%TEST_ERROR_LOG%';

DELETE FROM dbo.badge_text_templates
WHERE LOWER(name) = 'test'
   OR LOWER(LTRIM(RTRIM(content))) = 'guten tag';

UPDATE dbo.site_maps
SET
  name = N'Geländeplan Standort',
  original_file_name = CASE
    WHEN original_file_name LIKE '%ChatGPT%' THEN 'gelaendeplan-standort.png'
    ELSE original_file_name
  END,
  updated_at = SYSUTCDATETIME()
WHERE name LIKE '%ChatGPT%'
   OR ISNULL(original_file_name, '') LIKE '%ChatGPT%';
