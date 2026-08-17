import fs from "node:fs";
import { createApp } from "../app";
import { env } from "../config/env";
import { closePool, getPool } from "../lib/db";
import { createAdminIfMissing, findUserForLogin } from "../lib/users";
import { runMigrations } from "./migrate";
import { sendDueVisitReminders } from "../lib/mailRelay";
import { runRetentionCleanup } from "../lib/retentionCleanup";
import { APP_VERSION } from "../lib/appVersion";

const DATABASE_RETRY_DELAY_MS = 10_000;

async function verifyDatabaseConnection() {
  const pool = await getPool();
  await pool.request().query("SELECT 1 AS ok");
  console.log(`Connected to MSSQL ${env.MSSQL_HOST}:${env.MSSQL_PORT}/${env.MSSQL_DATABASE}`);
}

async function waitForDatabaseConnection(): Promise<void> {
  for (;;) {
    try {
      await verifyDatabaseConnection();
      return;
    } catch (error) {
      await closePool().catch(() => undefined);
      console.error(
        `Database is unavailable at ${env.MSSQL_HOST}:${env.MSSQL_PORT}; retrying in ${DATABASE_RETRY_DELAY_MS / 1000}s.`,
        error instanceof Error ? error.message : error
      );
      await new Promise((resolve) => setTimeout(resolve, DATABASE_RETRY_DELAY_MS));
    }
  }
}

async function main() {
  fs.mkdirSync(env.uploadDir, { recursive: true });

  console.log("Starting Besucher Manager container bootstrap...");
  console.log(`Application version: ${APP_VERSION}`);
  await waitForDatabaseConnection();
  const appliedMigrations = await runMigrations();
  console.log(
    appliedMigrations.length > 0
      ? `Applied migrations: ${appliedMigrations.join(", ")}`
      : "No pending migrations."
  );

  const adminUsername = env.ADMIN_USERNAME || env.INITIAL_ADMIN_USER;
  const adminPassword = env.ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;

  if (!adminUsername && adminPassword) {
    throw new Error("Set both ADMIN_USERNAME and ADMIN_PASSWORD (or INITIAL_ADMIN_USER and INITIAL_ADMIN_PASSWORD).");
  }

  if (adminUsername && !adminPassword) {
    const existingAdmin = await findUserForLogin(adminUsername);
    if (!existingAdmin) {
      throw new Error("An initial admin password is required when the configured admin user does not exist.");
    }
    console.log(`Startup admin user ${adminUsername} already exists. Keeping stored credentials and profile data.`);
  } else if (adminUsername && adminPassword) {
    const adminResult = await createAdminIfMissing({ username: adminUsername, password: adminPassword });
    console.log(adminResult.created
      ? `Created startup admin user ${adminUsername}.`
      : `Startup admin user ${adminUsername} already exists. Keeping stored credentials and profile data.`);
  }

  await closePool();

  const app = createApp();
  const runReminderJob = () => { void sendDueVisitReminders().catch((error) => console.error("visit reminder job failed", error)); };
  runReminderJob();
  setInterval(runReminderJob, 15 * 60 * 1000).unref();
  const runRetentionJob = () => { void runRetentionCleanup().catch((error) => console.error("retention cleanup failed", error)); };
  runRetentionJob();
  setInterval(runRetentionJob, 24 * 60 * 60 * 1000).unref();
  app.listen(env.APP_PORT, env.APP_HOST, () => {
    console.log(`besucher-manager listening on http://${env.APP_HOST}:${env.APP_PORT}`);
  });
}

main().catch((error) => {
  console.error("Startup failed.", error);
  process.exit(1);
});
