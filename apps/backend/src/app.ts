import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import crypto from "node:crypto";
import { env } from "./config/env";
import { apiRouter } from "./routes/api";
import { healthRouter } from "./routes/health";
import { loadSystemSettings, WORKFLOW_SETTING_KEYS } from "./lib/systemSettings";
import { resolveAuthenticatedUser, sendError } from "./routes/shared";
import { hasRole } from "./lib/visitWorkflow";

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

  app.use((request, response, next) => {
    request.requestId = crypto.randomUUID();
    response.setHeader("X-Request-Id", request.requestId);
    const startedAt = Date.now();
    response.on("finish", () => {
      if (!request.path.startsWith("/api")) return;
      console.info(JSON.stringify({
        level: response.statusCode >= 500 ? "error" : "info",
        action: "HTTP_REQUEST",
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        result: response.statusCode >= 400 ? "failure" : "success",
        status: response.statusCode,
        errorCode: response.locals.errorCode ?? null,
        durationMs: Date.now() - startedAt
      }));
    });
    next();
  });

  app.get("/api/maintenance/status", async (_request, response) => {
    const settings = await loadSystemSettings([WORKFLOW_SETTING_KEYS.maintenanceMode]);
    response.json({ maintenanceMode: settings.get(WORKFLOW_SETTING_KEYS.maintenanceMode) === "true" });
  });

  app.use(async (request, response, next) => {
    const exempt = request.path === "/health"
      || request.path === "/api/maintenance/status"
      || request.path.startsWith("/api/auth/")
      || request.path === "/api/ui-settings"
      || !request.path.startsWith("/api");
    if (exempt) return next();
    try {
      const settings = await loadSystemSettings([WORKFLOW_SETTING_KEYS.maintenanceMode]);
      if (settings.get(WORKFLOW_SETTING_KEYS.maintenanceMode) !== "true") return next();
      const user = await resolveAuthenticatedUser(request);
      if (user && hasRole(user, "admin")) return next();
      return sendError(response, 503, "MAINTENANCE_MODE", "Die Anwendung befindet sich im Wartungsmodus.");
    } catch {
      return next();
    }
  });

  app.use(healthRouter);
  app.use(apiRouter);
  app.use("/uploads", express.static(env.uploadDir));

  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("/{*splat}", (request, response, next) => {
      if (request.path.startsWith("/api") || request.path === "/health" || request.path.startsWith("/uploads")) {
        return next();
      }

      response.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  return app;
}
