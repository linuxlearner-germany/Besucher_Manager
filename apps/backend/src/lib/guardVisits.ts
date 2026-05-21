import sql from "mssql";
import { getPool } from "./db";
import { writeAuditLog } from "./auditLog";
import { assertCanCheckIn, assertCanCheckOut, canAccessGate, type AuthenticatedUser, VISIT_STATUS } from "./visitWorkflow";

export type GuardVisitListItem = {
  id: string;
  status: string;
  validFrom: string;
  validUntil: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  firstName: string;
  lastName: string;
  company: string;
  hostName: string;
  hostDepartment: string;
  purpose: string;
  gateId: string;
  gateName: string;
  licensePlate: string | null;
  signedByHostConfirmed: boolean;
  checkoutNote: string | null;
};

export type VisitDetail = GuardVisitListItem & {
  notes: string | null;
  badgeNumber: string | null;
  siteMap: { id: string; name: string; filePath: string } | null;
  badgeTexts: Array<{ id: string; name: string; textType: string; content: string }>;
};

type VisitScopeRow = {
  id: string;
  gateId: string;
  status: string;
};

const normalizedStatusSql = `
  CASE
    WHEN v.status = 'vorangemeldet' THEN '${VISIT_STATUS.PRE_REGISTERED}'
    WHEN v.status = 'eingecheckt' THEN '${VISIT_STATUS.CHECKED_IN}'
    WHEN v.status = 'ausgecheckt' THEN '${VISIT_STATUS.CHECKED_OUT}'
    ELSE v.status
  END
`;

function buildTodayQuery(status?: string, search?: string) {
  const predicates = [
    "(CAST(v.valid_from AS date) = CAST(SYSUTCDATETIME() AS date) OR CAST(v.check_in_at AS date) = CAST(SYSUTCDATETIME() AS date) OR CAST(v.check_out_at AS date) = CAST(SYSUTCDATETIME() AS date))"
  ];

  if (status && status !== "all") {
    predicates.push(`${normalizedStatusSql} = @status`);
  }

  if (search) {
    predicates.push(`(
      vis.first_name LIKE @search
      OR vis.last_name LIKE @search
      OR vis.company LIKE @search
      OR v.host_name LIKE @search
      OR ISNULL(v.license_plate, '') LIKE @search
    )`);
  }

  return predicates.join(" AND ");
}

function createScopeClause(user: AuthenticatedUser): string {
  if (user.role === "admin") {
    return "1 = 1";
  }

  return "v.gate_id = @gateId";
}

export async function getTodayVisitsForUser(
  user: AuthenticatedUser,
  options: { search?: string; status?: string }
): Promise<GuardVisitListItem[]> {
  const pool = await getPool();
  const request = pool.request();
  const search = options.search?.trim();

  if (user.role !== "admin") {
    request.input("gateId", sql.UniqueIdentifier, user.gateId);
  }

  if (options.status && options.status !== "all") {
    request.input("status", sql.NVarChar(32), options.status);
  }

  if (search) {
    request.input("search", sql.NVarChar(255), `%${search}%`);
  }

  const whereClause = `${createScopeClause(user)} AND ${buildTodayQuery(options.status, search)}`;

  const result = await request.query<GuardVisitListItem>(`
    SELECT
      v.id,
      ${normalizedStatusSql} AS status,
      CONVERT(NVARCHAR(30), v.valid_from, 127) AS validFrom,
      CONVERT(NVARCHAR(30), v.valid_until, 127) AS validUntil,
      CONVERT(NVARCHAR(30), v.check_in_at, 127) AS checkInAt,
      CONVERT(NVARCHAR(30), v.check_out_at, 127) AS checkOutAt,
      vis.first_name AS firstName,
      vis.last_name AS lastName,
      vis.company,
      v.host_name AS hostName,
      v.host_department AS hostDepartment,
      v.purpose,
      v.gate_id AS gateId,
      g.name AS gateName,
      v.license_plate AS licensePlate,
      v.signed_by_host_confirmed AS signedByHostConfirmed,
      v.checkout_note AS checkoutNote
    FROM dbo.visits v
    INNER JOIN dbo.visitors vis ON vis.id = v.visitor_id
    INNER JOIN dbo.gates g ON g.id = v.gate_id
    WHERE ${whereClause}
    ORDER BY
      CASE
        WHEN ${normalizedStatusSql} = '${VISIT_STATUS.CHECKED_IN}' THEN 0
        WHEN ${normalizedStatusSql} = '${VISIT_STATUS.PRE_REGISTERED}' THEN 1
        ELSE 2
      END,
      v.valid_from ASC,
      vis.last_name ASC,
      vis.first_name ASC
  `);

  return result.recordset;
}

export async function getVisitDetailForUser(user: AuthenticatedUser, visitId: string): Promise<VisitDetail | null> {
  const pool = await getPool();
  const request = pool.request().input("visitId", sql.UniqueIdentifier, visitId);

  if (user.role !== "admin") {
    request.input("gateId", sql.UniqueIdentifier, user.gateId);
  }

  const scopeClause = user.role === "admin" ? "1 = 1" : "v.gate_id = @gateId";
  const visitResult = await request.query<VisitDetail>(`
    SELECT
      v.id,
      ${normalizedStatusSql} AS status,
      CONVERT(NVARCHAR(30), v.valid_from, 127) AS validFrom,
      CONVERT(NVARCHAR(30), v.valid_until, 127) AS validUntil,
      CONVERT(NVARCHAR(30), v.check_in_at, 127) AS checkInAt,
      CONVERT(NVARCHAR(30), v.check_out_at, 127) AS checkOutAt,
      vis.first_name AS firstName,
      vis.last_name AS lastName,
      vis.company,
      v.host_name AS hostName,
      v.host_department AS hostDepartment,
      v.purpose,
      v.gate_id AS gateId,
      g.name AS gateName,
      v.license_plate AS licensePlate,
      v.signed_by_host_confirmed AS signedByHostConfirmed,
      v.checkout_note AS checkoutNote,
      v.notes,
      v.badge_number AS badgeNumber,
      CAST(NULL AS NVARCHAR(1)) AS siteMap,
      CAST(NULL AS NVARCHAR(1)) AS badgeTexts
    FROM dbo.visits v
    INNER JOIN dbo.visitors vis ON vis.id = v.visitor_id
    INNER JOIN dbo.gates g ON g.id = v.gate_id
    WHERE v.id = @visitId AND ${scopeClause}
  `);

  const visit = visitResult.recordset[0];

  if (!visit) {
    return null;
  }

  const siteMapResult = await pool.request().query<{ id: string; name: string; filePath: string }>(`
    SELECT TOP 1
      id,
      name,
      file_path AS filePath
    FROM dbo.site_maps
    WHERE is_active = 1
    ORDER BY created_at DESC
  `);

  const badgeTextsResult = await pool.request().query<{ id: string; name: string; textType: string; content: string }>(`
    SELECT
      id,
      name,
      text_type AS textType,
      content
    FROM dbo.badge_text_templates
    WHERE is_active = 1
    ORDER BY text_type ASC, name ASC
  `);

  return {
    ...visit,
    siteMap: siteMapResult.recordset[0] ?? null,
    badgeTexts: badgeTextsResult.recordset
  };
}

async function loadVisitForUpdate(transaction: sql.Transaction, visitId: string): Promise<VisitScopeRow | null> {
  const result = await new sql.Request(transaction)
    .input("visitId", sql.UniqueIdentifier, visitId)
    .query<VisitScopeRow>(`
      SELECT
        id,
        gate_id AS gateId,
        status
      FROM dbo.visits WITH (UPDLOCK, ROWLOCK)
      WHERE id = @visitId
    `);

  return result.recordset[0] ?? null;
}

export async function checkInVisit(user: AuthenticatedUser, visitId: string, ipAddress?: string | null): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const visit = await loadVisitForUpdate(transaction, visitId);

    if (!visit) {
      throw new Error("visit_not_found");
    }

    if (!canAccessGate(user, visit.gateId)) {
      throw new Error("visit_scope_forbidden");
    }

    assertCanCheckIn(visit.status);

    await new sql.Request(transaction)
      .input("visitId", sql.UniqueIdentifier, visitId)
      .query(`
        UPDATE dbo.visits
        SET
          status = '${VISIT_STATUS.CHECKED_IN}',
          check_in_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME()
        WHERE id = @visitId
      `);

    await writeAuditLog(
      {
        user: user.username,
        action: "VISIT_CHECKED_IN",
        objectType: "visit",
        objectId: visitId,
        ipAddress
      },
      transaction
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function checkOutVisit(
  user: AuthenticatedUser,
  visitId: string,
  signedByHostConfirmed: boolean,
  checkoutNote?: string,
  ipAddress?: string | null
): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const visit = await loadVisitForUpdate(transaction, visitId);

    if (!visit) {
      throw new Error("visit_not_found");
    }

    if (!canAccessGate(user, visit.gateId)) {
      throw new Error("visit_scope_forbidden");
    }

    assertCanCheckOut(visit.status, signedByHostConfirmed);

    await new sql.Request(transaction)
      .input("visitId", sql.UniqueIdentifier, visitId)
      .input("checkoutNote", sql.NVarChar(sql.MAX), checkoutNote?.trim() || null)
      .query(`
        UPDATE dbo.visits
        SET
          status = '${VISIT_STATUS.CHECKED_OUT}',
          check_out_at = SYSUTCDATETIME(),
          signed_by_host_confirmed = 1,
          checkout_note = @checkoutNote,
          updated_at = SYSUTCDATETIME()
        WHERE id = @visitId
      `);

    await writeAuditLog(
      {
        user: user.username,
        action: "VISIT_CHECKED_OUT",
        objectType: "visit",
        objectId: visitId,
        ipAddress
      },
      transaction
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
