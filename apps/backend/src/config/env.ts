import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

if (!process.env.APP_PORT && process.env.PORT) {
  process.env.APP_PORT = process.env.PORT;
}

const booleanish = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const optionalBooleanish = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized.length === 0) {
      return undefined;
    }

    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

function parseTrustProxy(value: string | undefined): boolean | number | string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  return trimmed;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_HOST: z.string().default("0.0.0.0"),
  APP_PORT: z.coerce.number().int().positive().default(3030),
  APP_SECRET: z.string().min(1, "APP_SECRET is required"),
  ADMIN_USERNAME: z.string().trim().min(1).optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  INITIAL_ADMIN_USER: z.string().trim().min(1).optional(),
  INITIAL_ADMIN_PASSWORD: z.string().min(8).optional(),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3030"),
  APP_SECURE_COOKIES: optionalBooleanish,
  APP_TRUST_PROXY: z.string().trim().optional(),
  MSSQL_HOST: z.string().min(1, "MSSQL_HOST is required"),
  MSSQL_PORT: z.coerce.number().int().positive().default(1433),
  MSSQL_DATABASE: z.string().min(1, "MSSQL_DATABASE is required"),
  MSSQL_USER: z.string().min(1, "MSSQL_USER is required"),
  MSSQL_PASSWORD: z.string().min(1, "MSSQL_PASSWORD is required"),
  MSSQL_ENCRYPT: booleanish.default(false),
  MSSQL_TRUST_SERVER_CERTIFICATE: booleanish.default(true),
  UPLOAD_DIR: z.string().default("./uploads"),
  PUBLIC_FORM_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  PUBLIC_FORM_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  MAIL_RELAY_CONFIG_PATH: z.string().trim().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment configuration\n${issues.join("\n")}`);
}

export const env = {
  ...parsed.data,
  APP_SECURE_COOKIES: parsed.data.APP_SECURE_COOKIES ?? parsed.data.PUBLIC_BASE_URL.startsWith("https://"),
  appTrustProxy: parseTrustProxy(parsed.data.APP_TRUST_PROXY),
  uploadDir: path.resolve(parsed.data.UPLOAD_DIR),
  mailRelayConfigPath: parsed.data.MAIL_RELAY_CONFIG_PATH ? path.resolve(parsed.data.MAIL_RELAY_CONFIG_PATH) : null
};
