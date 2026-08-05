"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const mssql_1 = __importDefault(require("mssql"));
const db_1 = require("../lib/db");
const migrationVersion_1 = require("../lib/migrationVersion");
const migrationsDir = node_path_1.default.resolve(__dirname, "../../migrations");
async function ensureMigrationTable(pool) {
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
async function listApplied(pool) {
    const result = await pool.request().query("SELECT id FROM dbo.schema_migrations");
    return new Set(result.recordset.map((row) => row.id));
}
async function runMigrations() {
    const files = (0, migrationVersion_1.sortMigrations)((await promises_1.default.readdir(migrationsDir))
        .map(migrationVersion_1.parseMigrationFile)
        .filter((file) => file !== null));
    const pool = await new mssql_1.default.ConnectionPool((0, db_1.getSqlConfig)()).connect();
    const appliedThisRun = [];
    try {
        await ensureMigrationTable(pool);
        const applied = await listApplied(pool);
        for (const migration of files) {
            const migrationId = migration.fileName;
            if (applied.has(migrationId)) {
                continue;
            }
            const sqlText = await promises_1.default.readFile(node_path_1.default.join(migrationsDir, migration.fileName), "utf8");
            const transaction = new mssql_1.default.Transaction(pool);
            await transaction.begin();
            try {
                await new mssql_1.default.Request(transaction).batch(sqlText);
                await new mssql_1.default.Request(transaction)
                    .input("id", mssql_1.default.NVarChar(255), migrationId)
                    .input("version", mssql_1.default.Int, migration.version)
                    .query("INSERT INTO dbo.schema_migrations (id, migration_version) VALUES (@id, @version)");
                await transaction.commit();
                appliedThisRun.push(migrationId);
                console.log(`Applied migration v${migration.version}: ${migration.fileName}`);
            }
            catch (error) {
                await transaction.rollback();
                throw error;
            }
        }
        return appliedThisRun;
    }
    finally {
        await pool.close();
    }
}
if (require.main === module) {
    runMigrations().catch((error) => {
        console.error("Migration failed.", error);
        process.exit(1);
    });
}
