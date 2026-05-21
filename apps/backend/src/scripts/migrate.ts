import fs from "node:fs/promises";
import path from "node:path";
import sql from "mssql";
import { getSqlConfig } from "../lib/db";

const migrationsDir = path.resolve(__dirname, "../../migrations");
type AppliedMigrationRow = {
  id: string;
};

async function ensureMigrationTable(pool: sql.ConnectionPool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.schema_migrations', 'U') IS NOT NULL
      AND COL_LENGTH('dbo.schema_migrations', 'filename') IS NOT NULL
    BEGIN
      DROP TABLE dbo.schema_migrations;
    END

    IF OBJECT_ID('dbo.schema_migrations', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.schema_migrations (
        id NVARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
    END
  `);
}

async function listApplied(pool: sql.ConnectionPool): Promise<Set<string>> {
  const result = await pool.request().query<AppliedMigrationRow>("SELECT id FROM dbo.schema_migrations");
  return new Set(result.recordset.map((row) => row.id));
}

export async function runMigrations(): Promise<string[]> {
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  const pool = await new sql.ConnectionPool(getSqlConfig()).connect();
  const appliedThisRun: string[] = [];

  try {
    await ensureMigrationTable(pool);
    const applied = await listApplied(pool);

    for (const file of files) {
      const migrationId = file;

      if (applied.has(file)) {
        continue;
      }

      const sqlText = await fs.readFile(path.join(migrationsDir, file), "utf8");
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        await new sql.Request(transaction).batch(sqlText);
        await new sql.Request(transaction)
          .input("id", sql.NVarChar(255), migrationId)
          .query("INSERT INTO dbo.schema_migrations (id) VALUES (@id)");
        await transaction.commit();
        appliedThisRun.push(migrationId);
        console.log(`Applied migration ${file}`);
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
