"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.findUserForLogin = findUserForLogin;
exports.findUserById = findUserById;
exports.createOrUpdateAdmin = createOrUpdateAdmin;
exports.createOrUpdateUser = createOrUpdateUser;
const mssql_1 = __importDefault(require("mssql"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("./db");
async function hashPassword(password) {
    return bcryptjs_1.default.hash(password, 12);
}
async function verifyPassword(password, passwordHash) {
    return bcryptjs_1.default.compare(password, passwordHash);
}
async function findUserForLogin(username) {
    const pool = await (0, db_1.getPool)();
    const result = await pool.request().input("username", mssql_1.default.NVarChar(120), username).query(`
    SELECT
      id,
      username,
      password_hash AS passwordHash,
      role,
      COALESCE(gate_id, default_gate_id) AS gateId,
      is_active AS isActive
    FROM dbo.users
    WHERE username = @username
  `);
    return result.recordset[0] ?? null;
}
async function findUserById(id) {
    const pool = await (0, db_1.getPool)();
    const result = await pool.request().input("id", mssql_1.default.UniqueIdentifier, id).query(`
    SELECT
      id,
      username,
      role,
      COALESCE(gate_id, default_gate_id) AS gateId,
      is_active AS isActive
    FROM dbo.users
    WHERE id = @id
  `);
    const user = result.recordset[0];
    if (!user || !user.isActive) {
        return null;
    }
    return {
        id: user.id,
        username: user.username,
        role: user.role,
        gateId: user.gateId
    };
}
async function createOrUpdateAdmin(input) {
    const pool = await (0, db_1.getPool)();
    const passwordHash = await hashPassword(input.password);
    const existing = await findUserForLogin(input.username);
    if (existing) {
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, existing.id)
            .input("passwordHash", mssql_1.default.NVarChar(255), passwordHash)
            .query(`
        UPDATE dbo.users
        SET
          password_hash = @passwordHash,
          role = 'admin',
          is_active = 1,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        return {
            created: false,
            userId: existing.id
        };
    }
    const inserted = await pool.request()
        .input("username", mssql_1.default.NVarChar(120), input.username)
        .input("passwordHash", mssql_1.default.NVarChar(255), passwordHash)
        .query(`
      INSERT INTO dbo.users (
        username,
        password_hash,
        display_name,
        role,
        is_active
      )
      OUTPUT inserted.id
      VALUES (
        @username,
        @passwordHash,
        @username,
        'admin',
        1
      )
    `);
    return {
        created: true,
        userId: inserted.recordset[0].id
    };
}
async function createOrUpdateUser(input) {
    const pool = await (0, db_1.getPool)();
    const passwordHash = await hashPassword(input.password);
    const existing = await findUserForLogin(input.username);
    if (existing) {
        await pool.request()
            .input("id", mssql_1.default.UniqueIdentifier, existing.id)
            .input("passwordHash", mssql_1.default.NVarChar(255), passwordHash)
            .input("role", mssql_1.default.NVarChar(32), input.role)
            .input("gateId", mssql_1.default.UniqueIdentifier, input.role === "guard" ? (input.gateId ?? null) : null)
            .query(`
        UPDATE dbo.users
        SET
          password_hash = @passwordHash,
          role = @role,
          gate_id = @gateId,
          is_active = 1,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
        return {
            created: false,
            userId: existing.id
        };
    }
    const inserted = await pool.request()
        .input("username", mssql_1.default.NVarChar(120), input.username)
        .input("passwordHash", mssql_1.default.NVarChar(255), passwordHash)
        .input("role", mssql_1.default.NVarChar(32), input.role)
        .input("gateId", mssql_1.default.UniqueIdentifier, input.role === "guard" ? (input.gateId ?? null) : null)
        .query(`
      INSERT INTO dbo.users (
        username,
        password_hash,
        display_name,
        role,
        gate_id,
        is_active
      )
      OUTPUT inserted.id
      VALUES (
        @username,
        @passwordHash,
        @username,
        @role,
        @gateId,
        1
      )
    `);
    return {
        created: true,
        userId: inserted.recordset[0].id
    };
}
