import fs from "node:fs";
import { createApp } from "./app";
import { env } from "./config/env";

export async function startServer() {
  fs.mkdirSync(env.uploadDir, { recursive: true });

  const app = createApp();
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
