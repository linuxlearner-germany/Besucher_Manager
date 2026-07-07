"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeGroups = normalizeGroups;
exports.normalizeUserEmail = normalizeUserEmail;
exports.normalizeMenuAccess = normalizeMenuAccess;
exports.normalizePermissions = normalizePermissions;
exports.loadUserGroupsAndMenuAccess = loadUserGroupsAndMenuAccess;
exports.replaceUserGroupsAndMenuAccess = replaceUserGroupsAndMenuAccess;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.findUserForLogin = findUserForLogin;
exports.findUserById = findUserById;
exports.listNotificationEmailsByMenuAccess = listNotificationEmailsByMenuAccess;
exports.createOrUpdateAdmin = createOrUpdateAdmin;
exports.createOrUpdateUser = createOrUpdateUser;
const mssql_1 = __importDefault(require("mssql"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("./db");
const visitWorkflow_1 = require("./visitWorkflow");
function normalizeGroups(groups) {
    return Array.from(new Set((groups ?? [])
        .map((entry) => entry.trim())
        .filter(Boolean))).sort((left, right) => left.localeCompare(right, "de"));
}
function normalizeUserEmail(email) {
    if (typeof email !== "string") {
        return null;
    }
    const normalized = email.trim().toLowerCase();
    return normalized ? normalized : null;
}
function normalizeMenuAccess(role, menuAccess) {
    const allowed = new Set((0, visitWorkflow_1.getAllowedMenuAccessForRole)(role));
    const requested = (menuAccess ?? [])
        .map((entry) => entry.trim())
        .filter((entry) => visitWorkflow_1.APP_MENU_KEYS.includes(entry) && allowed.has(entry));
    if (requested.length === 0) {
        return (0, visitWorkflow_1.getDefaultMenuAccessForRole)(role);
    }
    return Array.from(new Set(requested)).sort((left, right) => left.localeCompare(right, "de"));
}
function normalizePermissions(role, permissions, menuAccess) {
    return (0, visitWorkflow_1.normalizeUserPermissions)(role, permissions, normalizeMenuAccess(role, menuAccess));
}
async function loadUserGroupsAndMenuAccess(userIds, transaction) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    const groupsByUserId = Object.fromEntries(uniqueUserIds.map((userId) => [userId, []]));
    const menuAccessByUserId = Object.fromEntries(uniqueUserIds.map((userId) => [userId, []]));
    if (uniqueUserIds.length === 0) {
        return { groupsByUserId, menuAccessByUserId };
    }
    const idsSql = uniqueUserIds.map((userId) => `'${userId.replace(/'/g, "''")}'`).join(",");
    const pool = transaction ? null : await (0, db_1.getPool)();
    const groupsRequest = transaction ? new mssql_1.default.Request(transaction) : pool.request();
    const groupsResult = await groupsRequest.query(`
    SELECT
      user_id AS userId,
      group_name AS groupName
    FROM dbo.user_groups
    WHERE user_id IN (${idsSql})
    ORDER BY group_name ASC
  `);
    const menuAccessRequest = transaction ? new mssql_1.default.Request(transaction) : pool.request();
    const menuAccessResult = await menuAccessRequest.query(`
    SELECT
      user_id AS userId,
      menu_key AS menuKey
    FROM dbo.user_menu_access
    WHERE user_id IN (${idsSql})
    ORDER BY menu_key ASC
  `);
    for (const row of groupsResult.recordset) {
        groupsByUserId[row.userId] = [...(groupsByUserId[row.userId] ?? []), row.groupName];
    }
    for (const row of menuAccessResult.recordset) {
        menuAccessByUserId[row.userId] = [...(menuAccessByUserId[row.userId] ?? []), row.menuKey];
    }
    return {
        groupsByUserId,
        menuAccessByUserId
    };
}
async function replaceUserGroupsAndMenuAccess(userId, role, groups, menuAccess, transaction) {
    const normalizedGroups = normalizeGroups(groups);
    const normalizedMenuAccess = normalizeMenuAccess(role, menuAccess);
    await new mssql_1.default.Request(transaction)
        .input("userId", mssql_1.default.UniqueIdentifier, userId)
        .query(`
      DELETE FROM dbo.user_groups WHERE user_id = @userId;
      DELETE FROM dbo.user_menu_access WHERE user_id = @userId;
    `);
    for (const groupName of normalizedGroups) {
        await new mssql_1.default.Request(transaction)
            .input("userId", mssql_1.default.UniqueIdentifier, userId)
            .input("groupName", mssql_1.default.NVarChar(120), groupName)
            .query(`
        INSERT INTO dbo.user_groups(user_id, group_name)
        VALUES(@userId, @groupName)
      `);
    }
    for (const menuKey of normalizedMenuAccess) {
        await new mssql_1.default.Request(transaction)
            .input("userId", mssql_1.default.UniqueIdentifier, userId)
            .input("menuKey", mssql_1.default.NVarChar(80), menuKey)
            .query(`
        INSERT INTO dbo.user_menu_access(user_id, menu_key)
        VALUES(@userId, @menuKey)
      `);
    }
}
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
      is_active AS isActive,
      permissions_json AS permissionsJson
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
      is_active AS isActive,
      permissions_json AS permissionsJson
    FROM dbo.users
    WHERE id = @id
  `);
    const user = result.recordset[0];
    if (!user || !user.isActive) {
        return null;
    }
    const { groupsByUserId, menuAccessByUserId } = await loadUserGroupsAndMenuAccess([user.id]);
    const effectiveMenuAccess = normalizeMenuAccess(user.role, menuAccessByUserId[user.id]?.length ? menuAccessByUserId[user.id] : (0, visitWorkflow_1.getDefaultMenuAccessForRole)(user.role));
    return {
        id: user.id,
        username: user.username,
        role: user.role,
        gateId: user.gateId,
        groups: groupsByUserId[user.id] ?? [],
        menuAccess: effectiveMenuAccess,
        permissions: normalizePermissions(user.role, (0, visitWorkflow_1.parsePermissionsJson)(user.permissionsJson), effectiveMenuAccess)
    };
}
async function listNotificationEmailsByMenuAccess(menuKey) {
    const pool = await (0, db_1.getPool)();
    const result = await pool.request().query(`
    SELECT
      id,
      user_email AS email,
      role
    FROM dbo.users
    WHERE is_active = 1
      AND role <> 'guard'
      AND user_email IS NOT NULL
      AND LTRIM(RTRIM(user_email)) <> ''
  `);
    if (result.recordset.length === 0) {
        return [];
    }
    const { menuAccessByUserId } = await loadUserGroupsAndMenuAccess(result.recordset.map((entry) => entry.id));
    return Array.from(new Set(result.recordset
        .filter((entry) => {
        const effectiveMenuAccess = menuAccessByUserId[entry.id]?.length
            ? normalizeMenuAccess(entry.role, menuAccessByUserId[entry.id])
            : (0, visitWorkflow_1.getDefaultMenuAccessForRole)(entry.role);
        return effectiveMenuAccess.includes(menuKey);
    })
        .map((entry) => normalizeUserEmail(entry.email))
        .filter((entry) => Boolean(entry))));
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
            .input("gateId", mssql_1.default.UniqueIdentifier, null)
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
        .input("gateId", mssql_1.default.UniqueIdentifier, null)
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
