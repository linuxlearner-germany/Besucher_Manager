import sql from "mssql";
import bcrypt from "bcryptjs";
import { getPool } from "./db";
import {
  APP_MENU_KEYS,
  getAllowedMenuAccessForRole,
  getDefaultMenuAccessForRole,
  normalizeUserPermissions,
  parsePermissionsJson,
  type AppMenuKey,
  type AppRole,
  type AuthenticatedUser,
  type UserPermissions,
  type UserPermissionsInput
} from "./visitWorkflow";

type DbUserRow = {
  id: string;
  username: string;
  passwordHash: string;
  role: AuthenticatedUser["role"];
  gateId: string | null;
  isActive: boolean;
  permissionsJson?: string | null;
};

type UserNotificationRow = {
  id: string;
  email: string | null;
  role: AppRole;
};

type CreateAdminInput = {
  username: string;
  password: string;
};

export function normalizeGroups(groups: string[] | null | undefined): string[] {
  return Array.from(
    new Set(
      (groups ?? [])
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, "de"));
}

export function normalizeUserEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function normalizeMenuAccess(role: AppRole, menuAccess: string[] | null | undefined): AppMenuKey[] {
  const allowed = new Set(getAllowedMenuAccessForRole(role));
  const requested = (menuAccess ?? [])
    .map((entry) => entry.trim())
    .filter((entry): entry is AppMenuKey => APP_MENU_KEYS.includes(entry as AppMenuKey) && allowed.has(entry as AppMenuKey));

  if (requested.length === 0) {
    return getDefaultMenuAccessForRole(role);
  }

  return Array.from(new Set(requested)).sort((left, right) => left.localeCompare(right, "de")) as AppMenuKey[];
}

export function normalizePermissions(
  role: AppRole,
  permissions: UserPermissionsInput | null | undefined,
  menuAccess: string[] | null | undefined
): UserPermissions {
  return normalizeUserPermissions(role, permissions, normalizeMenuAccess(role, menuAccess));
}

type GroupRow = {
  userId: string;
  groupName: string;
};

type MenuAccessRow = {
  userId: string;
  menuKey: AppMenuKey;
};

export async function loadUserGroupsAndMenuAccess(userIds: string[], transaction?: sql.Transaction): Promise<{
  groupsByUserId: Record<string, string[]>;
  menuAccessByUserId: Record<string, AppMenuKey[]>;
}> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const groupsByUserId = Object.fromEntries(uniqueUserIds.map((userId) => [userId, [] as string[]]));
  const menuAccessByUserId = Object.fromEntries(uniqueUserIds.map((userId) => [userId, [] as AppMenuKey[]]));

  if (uniqueUserIds.length === 0) {
    return { groupsByUserId, menuAccessByUserId };
  }

  const idsSql = uniqueUserIds.map((userId) => `'${userId.replace(/'/g, "''")}'`).join(",");
  const pool = transaction ? null : await getPool();
  const groupsRequest = transaction ? new sql.Request(transaction) : pool!.request();
  const groupsResult = await groupsRequest.query<GroupRow>(`
    SELECT
      user_id AS userId,
      group_name AS groupName
    FROM dbo.user_groups
    WHERE user_id IN (${idsSql})
    ORDER BY group_name ASC
  `);

  const menuAccessRequest = transaction ? new sql.Request(transaction) : pool!.request();
  const menuAccessResult = await menuAccessRequest.query<MenuAccessRow>(`
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

export async function replaceUserGroupsAndMenuAccess(
  userId: string,
  role: AppRole,
  groups: string[] | null | undefined,
  menuAccess: string[] | null | undefined,
  transaction: sql.Transaction
): Promise<void> {
  const normalizedGroups = normalizeGroups(groups);
  const normalizedMenuAccess = normalizeMenuAccess(role, menuAccess);

  await new sql.Request(transaction)
    .input("userId", sql.UniqueIdentifier, userId)
    .query(`
      DELETE FROM dbo.user_groups WHERE user_id = @userId;
      DELETE FROM dbo.user_menu_access WHERE user_id = @userId;
    `);

  for (const groupName of normalizedGroups) {
    await new sql.Request(transaction)
      .input("userId", sql.UniqueIdentifier, userId)
      .input("groupName", sql.NVarChar(120), groupName)
      .query(`
        INSERT INTO dbo.user_groups(user_id, group_name)
        VALUES(@userId, @groupName)
      `);
  }

  for (const menuKey of normalizedMenuAccess) {
    await new sql.Request(transaction)
      .input("userId", sql.UniqueIdentifier, userId)
      .input("menuKey", sql.NVarChar(80), menuKey)
      .query(`
        INSERT INTO dbo.user_menu_access(user_id, menu_key)
        VALUES(@userId, @menuKey)
      `);
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function findUserForLogin(username: string): Promise<DbUserRow | null> {
  const pool = await getPool();
  const result = await pool.request().input("username", sql.NVarChar(120), username).query<DbUserRow>(`
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

export async function findUserById(id: string): Promise<AuthenticatedUser | null> {
  const pool = await getPool();
  const result = await pool.request().input("id", sql.UniqueIdentifier, id).query<AuthenticatedUser & { isActive: boolean; permissionsJson: string | null }>(`
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

  const effectiveMenuAccess = normalizeMenuAccess(
    user.role,
    menuAccessByUserId[user.id]?.length ? menuAccessByUserId[user.id] : getDefaultMenuAccessForRole(user.role)
  );

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    gateId: user.gateId,
    groups: groupsByUserId[user.id] ?? [],
    menuAccess: effectiveMenuAccess,
    permissions: normalizePermissions(
      user.role,
      parsePermissionsJson(user.permissionsJson),
      effectiveMenuAccess
    )
  };
}

export async function listNotificationEmailsByMenuAccess(menuKey: AppMenuKey): Promise<string[]> {
  const pool = await getPool();
  const result = await pool.request().query<UserNotificationRow>(`
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

  return Array.from(
    new Set(
      result.recordset
        .filter((entry) => {
          const effectiveMenuAccess = menuAccessByUserId[entry.id]?.length
            ? normalizeMenuAccess(entry.role, menuAccessByUserId[entry.id])
            : getDefaultMenuAccessForRole(entry.role);

          return effectiveMenuAccess.includes(menuKey);
        })
        .map((entry) => normalizeUserEmail(entry.email))
        .filter((entry): entry is string => Boolean(entry))
    )
  );
}

export async function createOrUpdateAdmin(input: CreateAdminInput): Promise<{ created: boolean; userId: string }> {
  const pool = await getPool();
  const passwordHash = await hashPassword(input.password);
  const existing = await findUserForLogin(input.username);

  if (existing) {
    await pool.request()
      .input("id", sql.UniqueIdentifier, existing.id)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
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
    .input("username", sql.NVarChar(120), input.username)
    .input("passwordHash", sql.NVarChar(255), passwordHash)
    .query<{ id: string }>(`
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

export async function createOrUpdateUser(input: {
  username: string;
  password: string;
  role: AuthenticatedUser["role"];
  gateId?: string | null;
}): Promise<{ created: boolean; userId: string }> {
  const pool = await getPool();
  const passwordHash = await hashPassword(input.password);
  const existing = await findUserForLogin(input.username);

  if (existing) {
    await pool.request()
      .input("id", sql.UniqueIdentifier, existing.id)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .input("role", sql.NVarChar(32), input.role)
      .input("gateId", sql.UniqueIdentifier, null)
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
    .input("username", sql.NVarChar(120), input.username)
    .input("passwordHash", sql.NVarChar(255), passwordHash)
    .input("role", sql.NVarChar(32), input.role)
    .input("gateId", sql.UniqueIdentifier, null)
    .query<{ id: string }>(`
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
