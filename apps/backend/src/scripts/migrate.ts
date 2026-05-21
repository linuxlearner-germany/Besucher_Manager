import fs from "node:fs/promises";
import path from "node:path";
import sql from "mssql";
import { getSqlConfig } from "../lib/db";

const migrationsDir = path.resolve(__dirname, "../../migrations");

async function ensureMigrationTable(pool: sql.ConnectionPool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.schema_migrations', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.schema_migrations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        filename NVARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
    END
  `);
}

async function listApplied(pool: sql.ConnectionPool): Promise<Set<string>> {
  const result = await pool.request().query<{ filename: string }>("SELECT filename FROM dbo.schema_migrations");
  return new Set(result.recordset.map((row) => row.filename));
}

async function main() {
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  const pool = await new sql.ConnectionPool(getSqlConfig()).connect();

  try {
    await ensureMigrationTable(pool);
    const applied = await listApplied(pool);

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sqlText = await fs.readFile(path.join(migrationsDir, file), "utf8");
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        await new sql.Request(transaction).batch(sqlText);
        await new sql.Request(transaction)
          .input("filename", sql.NVarChar(255), file)
          .query("INSERT INTO dbo.schema_migrations (filename) VALUES (@filename)");
        await transaction.commit();
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
