"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const app_1 = require("../app");
const env_1 = require("../config/env");
const db_1 = require("../lib/db");
const users_1 = require("../lib/users");
const migrate_1 = require("./migrate");
async function verifyDatabaseConnection() {
    const pool = await (0, db_1.getPool)();
    await pool.request().query("SELECT 1 AS ok");
    console.log(`Connected to MSSQL ${env_1.env.MSSQL_HOST}:${env_1.env.MSSQL_PORT}/${env_1.env.MSSQL_DATABASE}`);
}
async function main() {
    node_fs_1.default.mkdirSync(env_1.env.uploadDir, { recursive: true });
    console.log("Starting Besucher Manager container bootstrap...");
    await verifyDatabaseConnection();
    const appliedMigrations = await (0, migrate_1.runMigrations)();
    console.log(appliedMigrations.length > 0
        ? `Applied migrations: ${appliedMigrations.join(", ")}`
        : "No pending migrations.");
    const adminUsername = env_1.env.ADMIN_USERNAME || env_1.env.INITIAL_ADMIN_USER;
    const adminPassword = env_1.env.ADMIN_PASSWORD || env_1.env.INITIAL_ADMIN_PASSWORD;
    if ((adminUsername && !adminPassword) || (!adminUsername && adminPassword)) {
        throw new Error("Set both ADMIN_USERNAME and ADMIN_PASSWORD (or INITIAL_ADMIN_USER and INITIAL_ADMIN_PASSWORD).");
    }
    if (adminUsername && adminPassword) {
        const adminResult = await (0, users_1.createOrUpdateAdmin)({
            username: adminUsername,
            password: adminPassword
        });
        console.log(adminResult.created ? `Created startup admin user ${adminUsername}.` : `Updated startup admin user ${adminUsername}.`);
    }
    await (0, db_1.closePool)();
    const app = (0, app_1.createApp)();
    app.listen(env_1.env.APP_PORT, env_1.env.APP_HOST, () => {
        console.log(`besucher-manager listening on http://${env_1.env.APP_HOST}:${env_1.env.APP_PORT}`);
    });
}
main().catch((error) => {
    console.error("Startup failed.", error);
    process.exit(1);
});
