import sql from "mssql";
import { Router } from "express";
import { z } from "zod";
import { writeAuditLog } from "../lib/auditLog";
import { getPool } from "../lib/db";
import { COUNTRIES, getCountryName, normalizeCountryCode } from "../lib/countries";
import { HOST_SIGNATURE_STATUS, VISIT_STATUS } from "../lib/visitWorkflow";
import { getRequestIp, getRequestUserAgent, handleUnexpectedError, requireAnyPermission, requirePermission, requireRole, sendError, sendValidationError } from "./shared";
import { handleVisitorImportUpload, sendVisitorImportTemplateWorkbook } from "./visitorImport";

export const sibeRouter = Router();

const sibeReadRoles = ["admin", "sibe", "kaskdt"] as const;
const sibeWriteRoles = ["admin", "sibe"] as const;
const importRoles = ["admin", "guard", "sibe"] as const;
const sibeVisitNotesSchema = z.object({
  notes: z.string().trim().max(4000, "Die Anmerkung darf maximal 4000 Zeichen enthalten.").optional().or(z.literal(""))
});
const nationalitySubscriptionsSchema = z.object({
  countryCodes: z.array(z.string()).max(COUNTRIES.length).transform((values, context) => {
    const normalized = values.map(normalizeCountryCode);
    if (normalized.some((code) => !code)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Die Länderauswahl enthält einen ungültigen Code." });
      return z.NEVER;
    }
    return Array.from(new Set(normalized as string[]));
  })
});

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (/[;"\r\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function buildCsv(rows: Array<Record<string, unknown>>): string {
  const headers = [
    "Besucher",
    "Firma",
    "Nationalität",
    "Kennzeichen",
    "Besuchsnummer",
    "Status",
    "Wache",
    "Ansprechpartner",
    "Abteilung",
    "Gültig von",
    "Gültig bis",
    "Check-in",
    "Check-out",
    "Unterschrift"
  ];
  const keys = [
    "visitorName",
    "company",
    "nationalityName",
    "licensePlate",
    "badgeNumber",
    "status",
    "gateName",
    "hostName",
    "hostDepartment",
    "validFrom",
    "validUntil",
    "checkInAt",
    "checkOutAt",
    "hostSignatureStatus"
  ];

  return [
    headers.map(csvEscape).join(";"),
    ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(";"))
  ].join("\r\n");
}

sibeRouter.get("/api/sibe/summary", async (request, response) => {
  const user = await requireAnyPermission(request, response, ["dashboards.sibe", "dashboards.commander"]);
  if (!user) return;

  try {
    const pool = await getPool();
    const [visitorsTotal, activeVisitors, todaysVisits, checkedInVisitors, usersTotal, activeUsers, signaturesPending, signaturesFollowUp, signaturesExceptions] = await Promise.all([
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.visitors WHERE is_deleted = 0"),
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.visitors WHERE is_deleted = 0 AND is_active = 1"),
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.visits WHERE CAST(valid_from AS date) = CAST(SYSUTCDATETIME() AS date)"),
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.visits WHERE status = 'checked_in'"),
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users"),
      pool.request().query<{ count: number }>("SELECT COUNT(*) AS count FROM dbo.users WHERE is_active = 1"),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE ISNULL(host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') = '${HOST_SIGNATURE_STATUS.PENDING}'`),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE host_signature_status = '${HOST_SIGNATURE_STATUS.SIGNED_LATER}'`),
      pool.request().query<{ count: number }>(`SELECT COUNT(*) AS count FROM dbo.visits WHERE host_signature_status = '${HOST_SIGNATURE_STATUS.MISSING_EXCEPTION}'`)
    ]);

    return response.json({
      visitorsTotal: visitorsTotal.recordset[0]?.count ?? 0,
      activeVisitors: activeVisitors.recordset[0]?.count ?? 0,
      todaysVisits: todaysVisits.recordset[0]?.count ?? 0,
      checkedInVisitors: checkedInVisitors.recordset[0]?.count ?? 0,
      usersTotal: usersTotal.recordset[0]?.count ?? 0,
      activeUsers: activeUsers.recordset[0]?.count ?? 0,
      signaturesPending: signaturesPending.recordset[0]?.count ?? 0,
      signaturesFollowUp: signaturesFollowUp.recordset[0]?.count ?? 0,
      signaturesExceptions: signaturesExceptions.recordset[0]?.count ?? 0
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die SiBe-Uebersicht konnte nicht geladen werden.");
  }
});

sibeRouter.get("/api/sibe/statistics/visits", async (request, response) => {
  const user = await requireAnyPermission(request, response, ["dashboards.sibe", "dashboards.commander"]);
  if (!user) return;

  const from = typeof request.query.from === "string" ? request.query.from.trim() : "";
  const to = typeof request.query.to === "string" ? request.query.to.trim() : "";
  if (!from || !to) {
    return sendError(response, 400, "VALIDATION_ERROR", "Bitte Zeitraum von/bis angeben.");
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return sendError(response, 400, "VALIDATION_ERROR", "Ungueltiges Datumsformat.");
  }
  if (toDate < fromDate) {
    return sendError(response, 400, "VALIDATION_ERROR", "Zeitraum ungueltig.");
  }

  try {
    const pool = await getPool();
    const requestBuilder = pool.request()
      .input("fromDate", sql.Date, from)
      .input("toDate", sql.Date, to);

    const summaryResult = await requestBuilder.query<{
      total: number;
      preRegistered: number;
      checkedIn: number;
      checkedOut: number;
    }>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = '${VISIT_STATUS.PRE_REGISTERED}' OR status = 'vorangemeldet' THEN 1 ELSE 0 END) AS preRegistered,
        SUM(CASE WHEN status = '${VISIT_STATUS.CHECKED_IN}' OR status = 'eingecheckt' THEN 1 ELSE 0 END) AS checkedIn,
        SUM(CASE WHEN status = '${VISIT_STATUS.CHECKED_OUT}' OR status = 'ausgecheckt' THEN 1 ELSE 0 END) AS checkedOut
      FROM dbo.visits
      WHERE CAST(valid_from AS date) >= @fromDate
        AND CAST(valid_from AS date) <= @toDate
    `);

    const byDayResult = await pool.request()
      .input("fromDate", sql.Date, from)
      .input("toDate", sql.Date, to)
      .query<{ date: string; count: number }>(`
        SELECT
          CONVERT(NVARCHAR(10), CAST(valid_from AS date), 23) AS date,
          COUNT(*) AS count
        FROM dbo.visits
        WHERE CAST(valid_from AS date) >= @fromDate
          AND CAST(valid_from AS date) <= @toDate
        GROUP BY CAST(valid_from AS date)
        ORDER BY CAST(valid_from AS date) ASC
      `);

    const summary = summaryResult.recordset[0] ?? { total: 0, preRegistered: 0, checkedIn: 0, checkedOut: 0 };
    return response.json({
      summary: {
        total: Number(summary.total || 0),
        pre_registered: Number(summary.preRegistered || 0),
        checked_in: Number(summary.checkedIn || 0),
        checked_out: Number(summary.checkedOut || 0)
      },
      by_day: byDayResult.recordset.map((entry) => ({
        date: entry.date,
        count: Number(entry.count || 0)
      }))
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die SiBe-Statistik konnte nicht geladen werden.");
  }
});

sibeRouter.get("/api/sibe/visitors", async (request, response) => {
  const user = await requirePermission(request, response, "visits.read");
  if (!user) return;

  try {
    const pool = await getPool();
    const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
    const company = typeof request.query.company === "string" ? request.query.company.trim() : "";
    const from = typeof request.query.from === "string" ? request.query.from.trim() : "";
    const to = typeof request.query.to === "string" ? request.query.to.trim() : "";
    const requestBuilder = pool.request();
    let whereClause = "v.is_deleted = 0";

    if (search) {
      requestBuilder.input("search", sql.NVarChar(255), `%${search}%`);
      whereClause += " AND (v.first_name LIKE @search OR v.last_name LIKE @search OR v.company LIKE @search)";
    }

    if (company) {
      requestBuilder.input("company", sql.NVarChar(255), `%${company}%`);
      whereClause += " AND v.company LIKE @company";
    }

    if (from) {
      requestBuilder.input("fromDate", sql.DateTime2, new Date(from));
      whereClause += " AND EXISTS (SELECT 1 FROM dbo.visits vi_from WHERE vi_from.visitor_id = v.id AND vi_from.valid_from >= @fromDate)";
    }

    if (to) {
      requestBuilder.input("toDate", sql.DateTime2, new Date(to));
      whereClause += " AND EXISTS (SELECT 1 FROM dbo.visits vi_to WHERE vi_to.visitor_id = v.id AND vi_to.valid_from < DATEADD(day, 1, @toDate))";
    }

    const result = await requestBuilder.query<{
      id: string;
      firstName: string;
      lastName: string;
      company: string;
      nationalityCode: string | null;
      birthDate: string | null;
      phone: string | null;
      email: string | null;
      archivedAt: string | null;
      visitCount: number;
      lastVisitAt: string | null;
    }>(`
      SELECT
        v.id,
        v.first_name AS firstName,
        v.last_name AS lastName,
        v.company,
        v.nationality_code AS nationalityCode,
        CONVERT(NVARCHAR(10), v.birth_date, 23) AS birthDate,
        v.phone_optional AS phone,
        v.email_optional AS email,
        CONVERT(NVARCHAR(30), v.archived_at, 127) AS archivedAt,
        COUNT(vi.id) AS visitCount,
        CONVERT(NVARCHAR(30), MAX(vi.valid_from), 127) AS lastVisitAt
      FROM dbo.visitors v
      LEFT JOIN dbo.visits vi ON vi.visitor_id = v.id
      WHERE ${whereClause}
      GROUP BY v.id, v.first_name, v.last_name, v.company, v.nationality_code, v.birth_date, v.phone_optional, v.email_optional, v.archived_at
      ORDER BY v.last_name ASC, v.first_name ASC
    `);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SIBE_VISITOR_SEARCH",
      objectType: "visitor",
      objectId: "search",
      ipAddress: getRequestIp(request)
    });

    return response.json({
      visitors: result.recordset.map((visitor) => ({
        ...visitor,
        nationalityName: getCountryName(visitor.nationalityCode)
      }))
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besucher konnten nicht geladen werden.");
  }
});

sibeRouter.get("/api/sibe/visits", async (request, response) => {
  const user = await requirePermission(request, response, "visits.read");
  if (!user) return;

  try {
    const pool = await getPool();
    const requestBuilder = pool.request();
    const conditions = ["1 = 1"];
    const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
    const status = typeof request.query.status === "string" ? request.query.status.trim() : "";
    const signatureStatus = typeof request.query.signatureStatus === "string" ? request.query.signatureStatus.trim() : "";
    const gateId = typeof request.query.gateId === "string" ? request.query.gateId.trim() : "";
    const gate = typeof request.query.gate === "string" ? request.query.gate.trim() : "";
    const from = typeof request.query.from === "string"
      ? request.query.from.trim()
      : (typeof request.query.dateFrom === "string" ? request.query.dateFrom.trim() : "");
    const to = typeof request.query.to === "string"
      ? request.query.to.trim()
      : (typeof request.query.dateTo === "string" ? request.query.dateTo.trim() : "");
    const company = typeof request.query.company === "string" ? request.query.company.trim() : "";
    const hostName = typeof request.query.hostName === "string" ? request.query.hostName.trim() : "";
    const licensePlate = typeof request.query.licensePlate === "string" ? request.query.licensePlate.trim() : "";
    const badgeNumber = typeof request.query.badgeNumber === "string" ? request.query.badgeNumber.trim() : "";

    const normalizedVisitStatusSql = `
      CASE
        WHEN vt.status = 'vorangemeldet' THEN '${VISIT_STATUS.PRE_REGISTERED}'
        WHEN vt.status = 'eingecheckt' THEN '${VISIT_STATUS.CHECKED_IN}'
        WHEN vt.status = 'ausgecheckt' THEN '${VISIT_STATUS.CHECKED_OUT}'
        ELSE vt.status
      END
    `;

    if (search) {
      requestBuilder.input("search", sql.NVarChar(255), `%${search}%`);
      conditions.push(`(
        vis.first_name LIKE @search
        OR vis.last_name LIKE @search
        OR vis.company LIKE @search
        OR vt.host_name LIKE @search
        OR vt.host_department LIKE @search
        OR ISNULL(vt.license_plate, '') LIKE @search
        OR ISNULL(vt.badge_number, '') LIKE @search
      )`);
    }

    if (status && status !== "all") {
      if (status === "overdue") {
        conditions.push(`
          ${normalizedVisitStatusSql} IN ('${VISIT_STATUS.PRE_REGISTERED}', '${VISIT_STATUS.CHECKED_IN}')
          AND vt.valid_until < SYSUTCDATETIME()
        `);
      } else {
        requestBuilder.input("status", sql.NVarChar(32), status);
        conditions.push(`${normalizedVisitStatusSql} = @status`);
      }
    }

    if (signatureStatus && signatureStatus !== "all") {
      requestBuilder.input("signatureStatus", sql.NVarChar(40), signatureStatus);
      conditions.push(`ISNULL(vt.host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') = @signatureStatus`);
    }

    if (gateId) {
      requestBuilder.input("gateId", sql.UniqueIdentifier, gateId);
      conditions.push("vt.gate_id = @gateId");
    }

    if (gate) {
      requestBuilder.input("gate", sql.NVarChar(255), `%${gate}%`);
      conditions.push("g.name LIKE @gate");
    }

    if (company) {
      requestBuilder.input("company", sql.NVarChar(255), `%${company}%`);
      conditions.push("vis.company LIKE @company");
    }

    if (hostName) {
      requestBuilder.input("hostName", sql.NVarChar(255), `%${hostName}%`);
      conditions.push("vt.host_name LIKE @hostName");
    }

    if (licensePlate) {
      requestBuilder.input("licensePlate", sql.NVarChar(80), `%${licensePlate}%`);
      conditions.push("ISNULL(vt.license_plate, '') LIKE @licensePlate");
    }

    if (badgeNumber) {
      requestBuilder.input("badgeNumber", sql.NVarChar(80), `%${badgeNumber}%`);
      conditions.push("ISNULL(vt.badge_number, '') LIKE @badgeNumber");
    }

    if (from) {
      requestBuilder.input("dateFrom", sql.DateTime2, new Date(from));
      conditions.push("vt.valid_from >= @dateFrom");
    }

    if (to) {
      requestBuilder.input("dateTo", sql.DateTime2, new Date(to));
      conditions.push("vt.valid_until < DATEADD(day, 1, @dateTo)");
    }

    const result = await requestBuilder.query<{
      id: string;
      visitorId: string;
      visitorName: string;
      company: string;
      nationalityCode: string | null;
      nationalityName: string | null;
      licensePlate: string | null;
      badgeNumber: string | null;
      status: string;
      gateName: string;
      hostName: string;
      hostDepartment: string;
      validFrom: string;
      validUntil: string;
      idDocumentValidUntil: string | null;
      checkInAt: string | null;
      checkOutAt: string | null;
      hostSignatureStatus: string;
    }>(`
      SELECT
        vt.id,
        vis.id AS visitorId,
        CONCAT(vis.first_name, ' ', vis.last_name) AS visitorName,
        vis.company,
        vis.nationality_code AS nationalityCode,
        vis.nationality_code AS nationalityName,
        vt.license_plate AS licensePlate,
        vt.badge_number AS badgeNumber,
        vt.status,
        ISNULL(g.name, 'Noch nicht zugeordnet') AS gateName,
        vt.host_name AS hostName,
        vt.host_department AS hostDepartment,
        CONVERT(NVARCHAR(30), vt.valid_from, 127) AS validFrom,
        CONVERT(NVARCHAR(30), vt.valid_until, 127) AS validUntil,
        CONVERT(NVARCHAR(10), vis.id_document_valid_until, 23) AS idDocumentValidUntil,
        CONVERT(NVARCHAR(30), vt.check_in_at, 127) AS checkInAt,
        CONVERT(NVARCHAR(30), vt.check_out_at, 127) AS checkOutAt,
        ISNULL(vt.host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus
      FROM dbo.visits vt
      INNER JOIN dbo.visitors vis ON vis.id = vt.visitor_id
      LEFT JOIN dbo.gates g ON g.id = vt.gate_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY vt.valid_from DESC
    `);

    return response.json({
      visits: result.recordset.map((visit) => ({
        ...visit,
        nationalityName: getCountryName(visit.nationalityCode)
      }))
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besuchshistorie konnte nicht geladen werden.");
  }
});

sibeRouter.get("/api/sibe/visits/export", async (request, response) => {
  const user = await requirePermission(request, response, "visits.read");
  if (!user) return;

  const range = typeof request.query.range === "string" ? request.query.range.trim() : "day";
  const dateText = typeof request.query.date === "string" && request.query.date.trim()
    ? request.query.date.trim()
    : new Date().toISOString().slice(0, 10);
  const baseDate = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(baseDate.getTime())) {
    return sendError(response, 400, "VALIDATION_ERROR", "Ungültiges Exportdatum.");
  }

  let fromDate: Date | null = new Date(baseDate);
  let toDateExclusive: Date | null = new Date(baseDate);
  toDateExclusive.setUTCDate(toDateExclusive.getUTCDate() + 1);

  if (range === "week") {
    const day = (baseDate.getUTCDay() + 6) % 7;
    fromDate = new Date(baseDate);
    fromDate.setUTCDate(baseDate.getUTCDate() - day);
    toDateExclusive = new Date(fromDate);
    toDateExclusive.setUTCDate(fromDate.getUTCDate() + 7);
  } else if (range === "month") {
    fromDate = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));
    toDateExclusive = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 1));
  } else if (range === "all") {
    fromDate = null;
    toDateExclusive = null;
  } else if (range !== "day") {
    return sendError(response, 400, "VALIDATION_ERROR", "Exportzeitraum muss day, week, month oder all sein.");
  }

  try {
    const pool = await getPool();
    const requestBuilder = pool.request();
    const conditions = ["1 = 1"];
    if (fromDate && toDateExclusive) {
      requestBuilder.input("fromDate", sql.DateTime2, fromDate);
      requestBuilder.input("toDateExclusive", sql.DateTime2, toDateExclusive);
      conditions.push("vt.valid_from >= @fromDate");
      conditions.push("vt.valid_from < @toDateExclusive");
    }

    const result = await requestBuilder.query<Record<string, unknown>>(`
      SELECT
        CONCAT(vis.first_name, ' ', vis.last_name) AS visitorName,
        vis.company,
        vis.nationality_code AS nationalityCode,
        vt.license_plate AS licensePlate,
        vt.badge_number AS badgeNumber,
        vt.status,
        ISNULL(g.name, 'Noch nicht zugeordnet') AS gateName,
        vt.host_name AS hostName,
        vt.host_department AS hostDepartment,
        CONVERT(NVARCHAR(30), vt.valid_from, 127) AS validFrom,
        CONVERT(NVARCHAR(30), vt.valid_until, 127) AS validUntil,
        CONVERT(NVARCHAR(30), vt.check_in_at, 127) AS checkInAt,
        CONVERT(NVARCHAR(30), vt.check_out_at, 127) AS checkOutAt,
        ISNULL(vt.host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus
      FROM dbo.visits vt
      INNER JOIN dbo.visitors vis ON vis.id = vt.visitor_id
      LEFT JOIN dbo.gates g ON g.id = vt.gate_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY vt.valid_from ASC, vis.last_name ASC, vis.first_name ASC
    `);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SIBE_VISIT_EXPORT",
      objectType: "visit",
      objectId: range,
      ipAddress: getRequestIp(request),
      metadata: { range, date: dateText, count: result.recordset.length }
    });

    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename=\"besucher-export-${range}-${dateText}.csv\"`);
    return response.send(`\uFEFF${buildCsv(result.recordset.map((row) => ({
      ...row,
      nationalityName: getCountryName(typeof row.nationalityCode === "string" ? row.nationalityCode : null)
    })))}`);
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Der Besucherexport konnte nicht erstellt werden.");
  }
});

sibeRouter.post("/api/sibe/visits/import", async (request, response) => {
  const user = await requirePermission(request, response, "imports.execute");
  if (!user) return;

  return handleVisitorImportUpload(request, response, {
    createdBy: user,
    fallbackGateId: user.role === "guard" ? user.gateId : null
  });
});

sibeRouter.get("/api/sibe/visits/import-template.xlsx", async (request, response) => {
  const user = await requireRole(request, response, [...importRoles]);
  if (!user) return;

  return sendVisitorImportTemplateWorkbook(response);
});

sibeRouter.get("/api/sibe/visits/:id", async (request, response) => {
  const user = await requirePermission(request, response, "visits.read");
  if (!user) return;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<any>(`
        SELECT
          vt.id,
          vt.status,
          CONVERT(NVARCHAR(30), vt.valid_from, 127) AS validFrom,
          CONVERT(NVARCHAR(30), vt.valid_until, 127) AS validUntil,
          CONVERT(NVARCHAR(30), vt.check_in_at, 127) AS checkInAt,
          CONVERT(NVARCHAR(30), vt.check_out_at, 127) AS checkOutAt,
          vis.first_name AS firstName,
          vis.last_name AS lastName,
          vis.company,
          vis.nationality_code AS nationalityCode,
          CONVERT(NVARCHAR(10), vis.birth_date, 23) AS birthDate,
          vis.phone_optional AS visitorPhone,
          vis.email_optional AS visitorEmail,
          vis.visitor_street AS visitorStreet,
          vis.visitor_house_number AS visitorHouseNumber,
          vis.visitor_postal_code AS visitorPostalCode,
          vis.visitor_city AS visitorCity,
          vis.visitor_address AS visitorAddress,
          vis.id_document_type AS idDocumentType,
          CONVERT(NVARCHAR(10), vis.id_document_valid_until, 23) AS idDocumentValidUntil,
          vis.id_document_number AS idDocumentNumber,
          vis.id_document_issuing_place AS idDocumentIssuingPlace,
          vt.host_name AS hostName,
          vt.host_email AS hostEmail,
          vt.host_phone AS hostPhone,
          vt.host_department AS hostDepartment,
          vt.host_unit AS hostUnit,
          vt.host_building AS hostBuilding,
          vt.host_room AS hostRoom,
          vt.host_extension AS hostExtension,
          vt.purpose,
          vt.visit_purpose_type AS visitPurposeType,
          vt.visit_company_order AS visitCompanyOrder,
          vt.visit_end_type AS visitEndType,
          vt.forwarded_to_note AS forwardedToNote,
          vt.gate_id AS gateId,
          ISNULL(g.name, 'Noch nicht zugeordnet') AS gateName,
          vt.license_plate AS licensePlate,
          vt.signed_by_host_confirmed AS signedByHostConfirmed,
          ISNULL(vt.host_signature_status, '${HOST_SIGNATURE_STATUS.PENDING}') AS hostSignatureStatus,
          CONVERT(NVARCHAR(10), vt.host_signature_date, 23) AS hostSignatureDate,
          vt.host_signature_note AS hostSignatureNote,
          confirmer.username AS hostSignatureConfirmedBy,
          CONVERT(NVARCHAR(30), vt.host_signature_confirmed_at, 127) AS hostSignatureConfirmedAt,
          vt.checkout_note AS checkoutNote,
          confirmerIn.username AS checkInBy,
          confirmerOut.username AS checkOutBy,
          vt.device_photo_app AS devicePhotoApp,
          vt.device_film_app AS deviceFilmApp,
          vt.device_video_camera AS deviceVideoCamera,
          vt.device_manufacturer AS deviceManufacturer,
          vt.device_serial_number AS deviceSerialNumber,
          vt.device_accessories AS deviceAccessories,
          vt.device_deposit_note AS deviceDepositNote,
          vt.device_return_confirmed AS deviceReturnConfirmed,
          CONVERT(NVARCHAR(30), vt.device_returned_at, 127) AS deviceReturnedAt,
          returner.username AS deviceReturnedBy,
          vt.notes,
          vt.badge_number AS badgeNumber
        FROM dbo.visits vt
        INNER JOIN dbo.visitors vis ON vis.id = vt.visitor_id
        LEFT JOIN dbo.gates g ON g.id = vt.gate_id
        LEFT JOIN dbo.users confirmer ON confirmer.id = vt.host_signature_confirmed_by
        LEFT JOIN dbo.users confirmerIn ON confirmerIn.id = vt.check_in_by
        LEFT JOIN dbo.users confirmerOut ON confirmerOut.id = vt.check_out_by
        LEFT JOIN dbo.users returner ON returner.id = vt.device_returned_by
        WHERE vt.id = @id
      `);

    const visit = result.recordset[0];
    if (!visit) {
      return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
    }

    return response.json({
      visit: {
        ...visit,
        nationalityName: getCountryName(visit.nationalityCode)
      }
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Besuchsdetails konnten nicht geladen werden.");
  }
});

sibeRouter.put("/api/sibe/visits/:id/notes", async (request, response) => {
  const user = await requirePermission(request, response, "visits.update");
  if (!user) return;

  const parsed = sibeVisitNotesSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    return sendValidationError(response, parsed.error.flatten());
  }

  try {
    const pool = await getPool();
    const notes = parsed.data.notes?.trim() || null;
    const visitResult = await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .query<{ id: string }>(`
        SELECT TOP 1 id
        FROM dbo.visits
        WHERE id = @id
      `);

    if (!visitResult.recordset[0]) {
      return sendError(response, 404, "NOT_FOUND", "Der Besuch wurde nicht gefunden.");
    }

    await pool.request()
      .input("id", sql.UniqueIdentifier, request.params.id)
      .input("notes", sql.NVarChar(sql.MAX), notes)
      .query(`
        UPDATE dbo.visits
        SET
          notes = @notes,
          updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SIBE_VISIT_NOTES_UPDATED",
      objectType: "visit",
      objectId: request.params.id,
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: {
        changed_fields: ["notes"]
      }
    });

    return response.json({
      message: "Anmerkung gespeichert.",
      notes
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Anmerkung konnte nicht gespeichert werden.");
  }
});

sibeRouter.get("/api/sibe/nationality-subscriptions", async (request, response) => {
  const user = await requireRole(request, response, [...sibeWriteRoles]);
  if (!user) return;
  try {
    const pool = await getPool();
    const [subscriptions, account] = await Promise.all([
      pool.request()
        .input("userId", sql.UniqueIdentifier, user.id)
        .query<{ countryCode: string }>("SELECT RTRIM(country_code) AS countryCode FROM dbo.user_nationality_subscriptions WHERE user_id = @userId ORDER BY country_code"),
      pool.request()
        .input("userId", sql.UniqueIdentifier, user.id)
        .query<{ email: string | null }>("SELECT user_email AS email FROM dbo.users WHERE id = @userId")
    ]);
    return response.json({
      countryCodes: subscriptions.recordset.map((row) => row.countryCode),
      email: account.recordset[0]?.email ?? null
    });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Länderabonnements konnten nicht geladen werden.");
  }
});

sibeRouter.put("/api/sibe/nationality-subscriptions", async (request, response) => {
  const user = await requireRole(request, response, [...sibeWriteRoles]);
  if (!user) return;
  const parsed = nationalitySubscriptionsSchema.safeParse(request.body ?? {});
  if (!parsed.success) return sendValidationError(response, parsed.error.flatten());

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    await new sql.Request(transaction)
      .input("userId", sql.UniqueIdentifier, user.id)
      .query("DELETE FROM dbo.user_nationality_subscriptions WHERE user_id = @userId");
    for (const countryCode of parsed.data.countryCodes) {
      await new sql.Request(transaction)
        .input("userId", sql.UniqueIdentifier, user.id)
        .input("countryCode", sql.NChar(2), countryCode)
        .query("INSERT INTO dbo.user_nationality_subscriptions (user_id, country_code) VALUES (@userId, @countryCode)");
    }
    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "NATIONALITY_SUBSCRIPTIONS_UPDATED",
      objectType: "user",
      objectId: user.id,
      ipAddress: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
      metadata: { countryCodes: parsed.data.countryCodes }
    }, transaction);
    await transaction.commit();
    return response.json({ success: true, countryCodes: parsed.data.countryCodes });
  } catch (error) {
    try { await transaction.rollback(); } catch {}
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Länderabonnements konnten nicht gespeichert werden.");
  }
});

sibeRouter.get("/api/sibe/users", async (request, response) => {
  const user = await requireRole(request, response, [...sibeWriteRoles]);
  if (!user) return;

  try {
    const pool = await getPool();
    const requestBuilder = pool.request();
    const conditions = ["1 = 1"];
    const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
    const username = typeof request.query.username === "string" ? request.query.username.trim() : "";
    const role = typeof request.query.role === "string" ? request.query.role.trim() : "";
    const gateId = typeof request.query.gateId === "string" ? request.query.gateId.trim() : "";
    const gate = typeof request.query.gate === "string" ? request.query.gate.trim() : "";
    const active = typeof request.query.active === "string" ? request.query.active.trim() : "";
    const lastLoginFrom = typeof request.query.lastLoginFrom === "string" ? request.query.lastLoginFrom.trim() : "";
    const lastLoginTo = typeof request.query.lastLoginTo === "string" ? request.query.lastLoginTo.trim() : "";

    if (search) {
      requestBuilder.input("search", sql.NVarChar(255), `%${search}%`);
      conditions.push("u.username LIKE @search");
    }
    if (username) {
      requestBuilder.input("username", sql.NVarChar(255), `%${username}%`);
      conditions.push("u.username LIKE @username");
    }
    if (role && role !== "all") {
      requestBuilder.input("role", sql.NVarChar(32), role);
      conditions.push("u.role = @role");
    }
    if (gateId) {
      requestBuilder.input("gateId", sql.UniqueIdentifier, gateId);
      conditions.push("u.gate_id = @gateId");
    }
    if (gate) {
      requestBuilder.input("gate", sql.NVarChar(255), `%${gate}%`);
      conditions.push("ISNULL(g.name, '') LIKE @gate");
    }
    if (active === "true") {
      conditions.push("u.is_active = 1");
    } else if (active === "false") {
      conditions.push("u.is_active = 0");
    }
    if (lastLoginFrom) {
      requestBuilder.input("lastLoginFrom", sql.DateTime2, new Date(lastLoginFrom));
      conditions.push("u.last_login_at >= @lastLoginFrom");
    }
    if (lastLoginTo) {
      requestBuilder.input("lastLoginTo", sql.DateTime2, new Date(lastLoginTo));
      conditions.push("u.last_login_at < DATEADD(day, 1, @lastLoginTo)");
    }

    const result = await requestBuilder.query<{
      id: string;
      username: string;
      role: "admin" | "guard" | "sibe" | "kaskdt";
      gateName: string | null;
      isActive: boolean;
      createdAt: string;
      lastLoginAt: string | null;
    }>(`
      SELECT
        u.id,
        u.username,
        u.role,
        g.name AS gateName,
        u.is_active AS isActive,
        CONVERT(NVARCHAR(30), u.created_at, 127) AS createdAt,
        CONVERT(NVARCHAR(30), u.last_login_at, 127) AS lastLoginAt
      FROM dbo.users u
      LEFT JOIN dbo.gates g ON g.id = u.gate_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY u.username ASC
    `);

    await writeAuditLog({
      user: user.username,
      userId: user.id,
      action: "SIBE_USER_SEARCH",
      objectType: "user",
      objectId: "search",
      ipAddress: getRequestIp(request)
    });

    return response.json({ users: result.recordset });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Die Benutzer konnten nicht geladen werden.");
  }
});

sibeRouter.get("/api/sibe/audit-logs", async (request, response) => {
  const user = await requirePermission(request, response, "logs.audit");
  if (!user) return;

  try {
    const pool = await getPool();
    const result = await pool.request().query<{
      id: string;
      user: string;
      action: string;
      objectType: string;
      objectId: string;
      ipAddress: string | null;
      timestamp: string;
    }>(`
      SELECT TOP 200
        id,
        [user],
        action,
        object_type AS objectType,
        object_id AS objectId,
        ip_address AS ipAddress,
        CONVERT(NVARCHAR(30), [timestamp], 127) AS [timestamp]
      FROM dbo.audit_logs
      ORDER BY [timestamp] DESC
    `);

    return response.json({ logs: result.recordset });
  } catch (error) {
    return handleUnexpectedError(response, error, "DATABASE_ERROR", "Das Auditlog konnte nicht geladen werden.");
  }
});
