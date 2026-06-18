import sql from "mssql";
import { getPool } from "./db";

export type ErrorLogEntry = {
  level?: "error" | "warning";
  errorCode: string;
  message: string;
  requestPath?: string | null;
  requestMethod?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  userName?: string | null;
  stackTrace?: string | null;
  metadataJson?: string | null;
};

export async function writeErrorLog(entry: ErrorLogEntry): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input("level", sql.NVarChar(16), entry.level ?? "error")
    .input("errorCode", sql.NVarChar(120), entry.errorCode)
    .input("message", sql.NVarChar(sql.MAX), entry.message)
    .input("requestPath", sql.NVarChar(500), entry.requestPath ?? null)
    .input("requestMethod", sql.NVarChar(16), entry.requestMethod ?? null)
    .input("ipAddress", sql.NVarChar(64), entry.ipAddress ?? null)
    .input("userAgent", sql.NVarChar(500), entry.userAgent ?? null)
    .input("userName", sql.NVarChar(255), entry.userName ?? null)
    .input("stackTrace", sql.NVarChar(sql.MAX), entry.stackTrace ?? null)
    .input("metadataJson", sql.NVarChar(sql.MAX), entry.metadataJson ?? null)
    .query(`
      INSERT INTO dbo.error_logs (
        [level],
        error_code,
        [message],
        request_path,
        request_method,
        ip_address,
        user_agent,
        user_name,
        stack_trace,
        metadata_json
      )
      VALUES (
        @level,
        @errorCode,
        @message,
        @requestPath,
        @requestMethod,
        @ipAddress,
        @userAgent,
        @userName,
        @stackTrace,
        @metadataJson
      )
    `);
}
