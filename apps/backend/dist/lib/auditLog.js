"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAuditLog = writeAuditLog;
const mssql_1 = __importDefault(require("mssql"));
const db_1 = require("./db");
async function writeAuditLog(entry, transaction) {
    const request = transaction ? new mssql_1.default.Request(transaction) : (await (0, db_1.getPool)()).request();
    await request
        .input("user", mssql_1.default.NVarChar(255), entry.user)
        .input("action", mssql_1.default.NVarChar(120), entry.action)
        .input("objectType", mssql_1.default.NVarChar(120), entry.objectType)
        .input("objectId", mssql_1.default.NVarChar(120), entry.objectId)
        .input("userId", mssql_1.default.UniqueIdentifier, entry.userId ?? null)
        .input("ipAddress", mssql_1.default.NVarChar(64), entry.ipAddress ?? null)
        .input("userAgent", mssql_1.default.NVarChar(500), entry.userAgent ?? null)
        .input("metadataJson", mssql_1.default.NVarChar(mssql_1.default.MAX), entry.metadata ? JSON.stringify(entry.metadata) : null)
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
