import { Router } from "express";
import { env } from "../config/env";

export const healthRouter = Router();

healthRouter.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "besucher-manager",
    environment: env.NODE_ENV,
    database: {
      configured: Boolean(env.MSSQL_HOST && env.MSSQL_DATABASE && env.MSSQL_USER)
    }
  });
});
