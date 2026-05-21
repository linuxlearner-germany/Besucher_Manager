import sql from "mssql";
import { getPool } from "./db";

type AuditLogEntry = {
  user: string;
  action: string;
  objectType: string;
  objectId: string;
  ipAddress?: string | null;
};

export async function writeAuditLog(entry: AuditLogEntry, transaction?: sql.Transaction): Promise<void> {
  const request = transaction ? new sql.Request(transaction) : (await getPool()).request();

  await request
    .input("user", sql.NVarChar(255), entry.user)
    .input("action", sql.NVarChar(120), entry.action)
    .input("objectType", sql.NVarChar(120), entry.objectType)
    .input("objectId", sql.NVarChar(120), entry.objectId)
    .input("ipAddress", sql.NVarChar(64), entry.ipAddress ?? null)
    .query(`
      INSERT INTO dbo.audit_logs (
        [user],
        action,
        object_type,
        object_id,
        ip_address
      )
      VALUES (
        @user,
        @action,
        @objectType,
        @objectId,
        @ipAddress
      )
    `);
}
