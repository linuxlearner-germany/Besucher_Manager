import fs from "node:fs";
import { createApp } from "./app";
import { env } from "./config/env";
import { sendDueVisitReminders } from "./lib/mailRelay";
import { runRetentionCleanup } from "./lib/retentionCleanup";

export async function startServer() {
  fs.mkdirSync(env.uploadDir, { recursive: true });

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

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
