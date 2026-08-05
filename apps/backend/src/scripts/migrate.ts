import fs from "node:fs/promises";
import path from "node:path";
import sql from "mssql";
import { getSqlConfig } from "../lib/db";
import { parseMigrationFile, sortMigrations } from "../lib/migrationVersion";

const migrationsDir = path.resolve(__dirname, "../../migrations");
type AppliedMigrationRow = {
  id: string;
};

async function ensureMigrationTable(pool: sql.ConnectionPool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.schema_migrations', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.schema_migrations (
        id NVARCHAR(255) NOT NULL PRIMARY KEY,
        migration_version INT NULL,
        applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
    END

    IF COL_LENGTH('dbo.schema_migrations', 'id') IS NULL
    BEGIN
      IF COL_LENGTH('dbo.schema_migrations', 'filename') IS NULL
        THROW 50001, 'schema_migrations benötigt die Spalte id oder filename.', 1;

      EXEC(N'
        ALTER TABLE dbo.schema_migrations ADD id NVARCHAR(255) NULL;
        UPDATE dbo.schema_migrations SET id = filename WHERE id IS NULL;
        ALTER TABLE dbo.schema_migrations ALTER COLUMN id NVARCHAR(255) NOT NULL;
      ');
    END

    IF COL_LENGTH('dbo.schema_migrations', 'migration_version') IS NULL
      EXEC(N'ALTER TABLE dbo.schema_migrations ADD migration_version INT NULL;');

    EXEC(N'
      UPDATE dbo.schema_migrations
      SET migration_version = TRY_CONVERT(INT, LEFT(id, CHARINDEX(''_'', id + ''_'') - 1))
      WHERE migration_version IS NULL;
    ');
  `);
}

async function listApplied(pool: sql.ConnectionPool): Promise<Set<string>> {
  const result = await pool.request().query<AppliedMigrationRow>("SELECT id FROM dbo.schema_migrations");
  return new Set(result.recordset.map((row) => row.id));
}

export async function runMigrations(): Promise<string[]> {
  const files = sortMigrations(
    (await fs.readdir(migrationsDir))
      .map(parseMigrationFile)
      .filter((file): file is NonNullable<typeof file> => file !== null)
  );

  const pool = await new sql.ConnectionPool(getSqlConfig()).connect();
  const appliedThisRun: string[] = [];

  try {
    await ensureMigrationTable(pool);
    const applied = await listApplied(pool);

    for (const migration of files) {
      const migrationId = migration.fileName;

      if (applied.has(migrationId)) {
        continue;
      }

      const sqlText = await fs.readFile(path.join(migrationsDir, migration.fileName), "utf8");
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        await new sql.Request(transaction).batch(sqlText);
        await new sql.Request(transaction)
          .input("id", sql.NVarChar(255), migrationId)
          .input("version", sql.Int, migration.version)
          .query("INSERT INTO dbo.schema_migrations (id, migration_version) VALUES (@id, @version)");
        await transaction.commit();
        appliedThisRun.push(migrationId);
        console.log(`Applied migration v${migration.version}: ${migration.fileName}`);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }

    return appliedThisRun;
  } finally {
    await pool.close();
  }
}

if (require.main === module) {
  runMigrations().catch((error) => {
    console.error("Migration failed.", error);
    process.exit(1);
  });
}
