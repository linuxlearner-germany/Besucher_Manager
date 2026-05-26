/*
  Legacy-Fehlerbehebung:
  In der öffentlichen Voranmeldung ist "Abteilung / Bereich" optional.
  Daher muss dbo.visits.host_department NULL-Werte erlauben.

  Diese Migration ist idempotent und ändert nur die Nullability,
  ohne Daten zu löschen.
*/

IF OBJECT_ID(N'dbo.visits', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.visits', N'host_department') IS NOT NULL
BEGIN
    DECLARE @isNullable BIT;
    DECLARE @columnType NVARCHAR(128);
    DECLARE @maxLength SMALLINT;
    DECLARE @precision TINYINT;
    DECLARE @scale TINYINT;
    DECLARE @typeSql NVARCHAR(256);
    DECLARE @sql NVARCHAR(MAX);

    SELECT
        @isNullable = c.is_nullable,
        @columnType = t.name,
        @maxLength = c.max_length,
        @precision = c.precision,
        @scale = c.scale
    FROM sys.columns c
    INNER JOIN sys.types t ON t.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID(N'dbo.visits')
      AND c.name = N'host_department';

    IF @isNullable = 0
    BEGIN
        SET @typeSql =
            CASE
                WHEN @columnType IN (N'nvarchar', N'nchar')
                    THEN @columnType + N'(' + CASE WHEN @maxLength = -1 THEN N'MAX' ELSE CAST(@maxLength / 2 AS NVARCHAR(10)) END + N')'
                WHEN @columnType IN (N'varchar', N'char', N'varbinary', N'binary')
                    THEN @columnType + N'(' + CASE WHEN @maxLength = -1 THEN N'MAX' ELSE CAST(@maxLength AS NVARCHAR(10)) END + N')'
                WHEN @columnType IN (N'decimal', N'numeric')
                    THEN @columnType + N'(' + CAST(@precision AS NVARCHAR(10)) + N',' + CAST(@scale AS NVARCHAR(10)) + N')'
                ELSE @columnType
            END;

        SET @sql = N'ALTER TABLE dbo.visits ALTER COLUMN host_department ' + @typeSql + N' NULL;';
        EXEC sp_executesql @sql;
    END
END
