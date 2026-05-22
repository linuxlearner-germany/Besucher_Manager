import sql from "mssql";
import { getPool } from "./db";

type AuditLogEntry = {
  user: string;
  action: string;
  objectType: string;
  objectId: string;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function writeAuditLog(entry: AuditLogEntry, transaction?: sql.Transaction): Promise<void> {
  const request = transaction ? new sql.Request(transaction) : (await getPool()).request();

  await request
    .input("user", sql.NVarChar(255), entry.user)
    .input("action", sql.NVarChar(120), entry.action)
    .input("objectType", sql.NVarChar(120), entry.objectType)
    .input("objectId", sql.NVarChar(120), entry.objectId)
    .input("userId", sql.UniqueIdentifier, entry.userId ?? null)
    .input("ipAddress", sql.NVarChar(64), entry.ipAddress ?? null)
    .input("userAgent", sql.NVarChar(500), entry.userAgent ?? null)
    .input("metadataJson", sql.NVarChar(sql.MAX), entry.metadata ? JSON.stringify(entry.metadata) : null)
    .query(`
      INSERT INTO dbo.audit_logs (
        [user],
        user_id,
        action,
        object_type,
        object_id,
        ip_address,
        user_agent,
        metadata_json
      )
      VALUES (
        @user,
        @userId,
        @action,
        @objectType,
        @objectId,
        @ipAddress,
        @userAgent,
        @metadataJson
      )
    `);
}
