import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { apiRouter } from "./routes/api";
import { healthRouter } from "./routes/health";

function resolveFrontendDist(): string {
  return path.resolve(__dirname, "../../frontend/dist");
}

export function createApp() {
  const app = express();
  const frontendDist = resolveFrontendDist();

  app.disable("x-powered-by");
  if (env.appTrustProxy !== undefined) {
    app.set("trust proxy", env.appTrustProxy);
  }
  app.use(
    helmet({
      contentSecurityPolicy: false
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser(env.APP_SECRET));

  app.use(healthRouter);
  app.use(apiRouter);
  app.use("/uploads", express.static(env.uploadDir));

  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("*", (request, response, next) => {
      if (request.path.startsWith("/api") || request.path === "/health" || request.path.startsWith("/uploads")) {
        return next();
      }

      response.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  return app;
}
