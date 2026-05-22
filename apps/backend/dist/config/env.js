"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const node_path_1 = __importDefault(require("node:path"));
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const booleanish = zod_1.z.preprocess((value) => {
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
}, zod_1.z.boolean());
const optionalBooleanish = zod_1.z.preprocess((value) => {
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
}, zod_1.z.boolean().optional());
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(["development", "test", "production"]).default("development"),
    APP_HOST: zod_1.z.string().default("0.0.0.0"),
    APP_PORT: zod_1.z.coerce.number().int().positive().default(3020),
    APP_SECRET: zod_1.z.string().min(1, "APP_SECRET is required"),
    ADMIN_USERNAME: zod_1.z.string().trim().min(1).optional(),
    ADMIN_PASSWORD: zod_1.z.string().min(8).optional(),
    INITIAL_ADMIN_USER: zod_1.z.string().trim().min(1).optional(),
    INITIAL_ADMIN_PASSWORD: zod_1.z.string().min(8).optional(),
    PUBLIC_BASE_URL: zod_1.z.string().url().default("http://localhost:3020"),
    APP_SECURE_COOKIES: optionalBooleanish,
    MSSQL_HOST: zod_1.z.string().min(1, "MSSQL_HOST is required"),
    MSSQL_PORT: zod_1.z.coerce.number().int().positive().default(1433),
    MSSQL_DATABASE: zod_1.z.string().min(1, "MSSQL_DATABASE is required"),
    MSSQL_USER: zod_1.z.string().min(1, "MSSQL_USER is required"),
    MSSQL_PASSWORD: zod_1.z.string().min(1, "MSSQL_PASSWORD is required"),
    MSSQL_ENCRYPT: booleanish.default(false),
    MSSQL_TRUST_SERVER_CERTIFICATE: booleanish.default(true),
    UPLOAD_DIR: zod_1.z.string().default("./uploads"),
    VISITOR_RETENTION_DAYS: zod_1.z.coerce.number().int().positive().default(90),
    PUBLIC_FORM_RATE_LIMIT: zod_1.z.coerce.number().int().positive().default(10),
    PUBLIC_FORM_RATE_WINDOW_SECONDS: zod_1.z.coerce.number().int().positive().default(900)
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration\n${issues.join("\n")}`);
}
exports.env = {
    ...parsed.data,
    APP_SECURE_COOKIES: parsed.data.APP_SECURE_COOKIES ?? parsed.data.PUBLIC_BASE_URL.startsWith("https://"),
    uploadDir: node_path_1.default.resolve(parsed.data.UPLOAD_DIR)
};
