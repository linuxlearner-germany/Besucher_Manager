import fs from "node:fs";
import { createApp } from "../app";
import { env } from "../config/env";
import { closePool, getPool } from "../lib/db";
import { runMigrations } from "./migrate";

async function verifyDatabaseConnection() {
  const pool = await getPool();
  await pool.request().query("SELECT 1 AS ok");
  console.log(`Connected to MSSQL ${env.MSSQL_HOST}:${env.MSSQL_PORT}/${env.MSSQL_DATABASE}`);
}

async function main() {
  fs.mkdirSync(env.uploadDir, { recursive: true });

  console.log("Starting Besucher Manager container bootstrap...");
  await verifyDatabaseConnection();
  const appliedMigrations = await runMigrations();
  console.log(
    appliedMigrations.length > 0
      ? `Applied migrations: ${appliedMigrations.join(", ")}`
      : "No pending migrations."
  );
  await closePool();

  const app = createApp();
  app.listen(env.APP_PORT, env.APP_HOST, () => {
    console.log(`besucher-manager listening on http://${env.APP_HOST}:${env.APP_PORT}`);
  });
}

main().catch((error) => {
  console.error("Startup failed.", error);
  process.exit(1);
});
