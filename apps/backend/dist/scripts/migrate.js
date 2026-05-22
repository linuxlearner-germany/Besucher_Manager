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
const migrationsDir = node_path_1.default.resolve(__dirname, "../../migrations");
async function ensureMigrationTable(pool) {
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
async function listApplied(pool) {
    const result = await pool.request().query("SELECT id FROM dbo.schema_migrations");
    return new Set(result.recordset.map((row) => row.id));
}
async function runMigrations() {
    const files = (await promises_1.default.readdir(migrationsDir))
        .filter((file) => file.endsWith(".sql"))
        .sort((left, right) => left.localeCompare(right));
    const pool = await new mssql_1.default.ConnectionPool((0, db_1.getSqlConfig)()).connect();
    const appliedThisRun = [];
    try {
        await ensureMigrationTable(pool);
        const applied = await listApplied(pool);
        for (const file of files) {
            const migrationId = file;
            if (applied.has(file)) {
                continue;
            }
            const sqlText = await promises_1.default.readFile(node_path_1.default.join(migrationsDir, file), "utf8");
            const transaction = new mssql_1.default.Transaction(pool);
            await transaction.begin();
            try {
                await new mssql_1.default.Request(transaction).batch(sqlText);
                await new mssql_1.default.Request(transaction)
                    .input("id", mssql_1.default.NVarChar(255), migrationId)
                    .query("INSERT INTO dbo.schema_migrations (id) VALUES (@id)");
                await transaction.commit();
                appliedThisRun.push(migrationId);
                console.log(`Applied migration ${file}`);
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
