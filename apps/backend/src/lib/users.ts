import sql from "mssql";
import bcrypt from "bcryptjs";
import { getPool } from "./db";
import type { AuthenticatedUser } from "./visitWorkflow";

type DbUserRow = {
  id: string;
  username: string;
  passwordHash: string;
  role: AuthenticatedUser["role"];
  gateId: string | null;
  isActive: boolean;
};

type CreateAdminInput = {
  username: string;
  password: string;
};

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
      is_active AS isActive
    FROM dbo.users
    WHERE username = @username
  `);

  return result.recordset[0] ?? null;
}

export async function findUserById(id: string): Promise<AuthenticatedUser | null> {
  const pool = await getPool();
  const result = await pool.request().input("id", sql.UniqueIdentifier, id).query<AuthenticatedUser & { isActive: boolean }>(`
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
      .input("gateId", sql.UniqueIdentifier, input.role === "guard" ? (input.gateId ?? null) : null)
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
    .input("gateId", sql.UniqueIdentifier, input.role === "guard" ? (input.gateId ?? null) : null)
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
