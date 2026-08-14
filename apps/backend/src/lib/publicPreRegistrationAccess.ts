import crypto from "node:crypto";
import sql from "mssql";
import { z } from "zod";
import { writeAuditLog } from "./auditLog";
import { getPool } from "./db";
import { cleanOptional } from "./textValues";
import { VISIT_STATUS } from "./visitWorkflow";

const TOKEN_BYTES = 32;

export const publicPreRegistrationUpdateSchema = z.object({
  version: z.string().trim().length(64, "Bitte laden Sie die Voranmeldung neu."),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  company: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(80).optional(),
  email: z.string().trim().email("Ungültige E-Mail-Adresse.").or(z.literal("")).optional(),
  licensePlate: z.string().trim().max(40).optional(),
  purpose: z.string().trim().max(500).optional(),
  hostName: z.string().trim().max(255).optional(),
  hostPhone: z.string().trim().max(80).optional(),
  hostDepartment: z.string().trim().max(255).optional()
}).strict().superRefine((value, context) => {
  if (Object.keys(value).every((key) => key === "version")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Es wurden keine Änderungen übermittelt." });
  }
});

export type PublicPreRegistrationUpdate = z.infer<typeof publicPreRegistrationUpdateSchema>;

type TokenExecutor = sql.ConnectionPool | sql.Transaction;

type PublicAccessRow = {
  tokenId: string;
  visitId: string;
  visitorId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  licensePlate: string | null;
  purpose: string | null;
  hostName: string | null;
  hostPhone: string | null;
  hostDepartment: string | null;
  validFrom: Date;
  validUntil: Date;
  expectedArrivalTime: Date | null;
  gateName: string | null;
  gateLocation: string | null;
  status: string;
  checkInAt: Date | null;
  cancelledAt: Date | null;
  rejectedAt: Date | null;
  visitUpdatedAt: string;
  visitorUpdatedAt: string;
  recipientUpdatedAt: Date | null;
};

export type PublicPreRegistrationDetail = {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  licensePlate: string | null;
  purpose: string | null;
  hostName: string | null;
  hostPhone: string | null;
  hostDepartment: string | null;
  validFrom: string;
  validUntil: string;
  expectedArrivalTime: string | null;
  gateName: string | null;
  gateLocation: string | null;
  status: string;
  editable: boolean;
  editMessage: string | null;
  recipientUpdatedAt: string | null;
  version: string;
};

export type PublicAccessFailure = "not_found" | "expired" | "revoked" | "conflict" | "not_editable";

export class PublicAccessError extends Error {
  constructor(public readonly reason: PublicAccessFailure) {
    super(reason);
  }
}

export function generatePublicAccessToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashPublicAccessToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function isPlausiblePublicAccessToken(token: string | null | undefined): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function createPublicRecordVersion(visitUpdatedAt: Date | string, visitorUpdatedAt: Date | string): string {
  const visitVersion = visitUpdatedAt instanceof Date ? visitUpdatedAt.toISOString() : visitUpdatedAt;
  const visitorVersion = visitorUpdatedAt instanceof Date ? visitorUpdatedAt.toISOString() : visitorUpdatedAt;
  return crypto.createHash("sha256")
    .update(`${visitVersion}|${visitorVersion}`, "utf8")
    .digest("hex");
}

function getBerlinUtcOffsetMinutes(date: Date): number {
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "longOffset" })
    .formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = zone.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

export function getGermanVisitDayStart(storedDate: Date): Date {
  const date = storedDate.toISOString().slice(0, 10);
  const [year, month, day] = date.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(year, month - 1, day));
  return new Date(utcMidnight.getTime() - getBerlinUtcOffsetMinutes(utcMidnight) * 60_000);
}

export function getGermanVisitDayEnd(storedDate: Date): Date {
  const date = storedDate.toISOString().slice(0, 10);
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1, 12));
  return new Date(getGermanVisitDayStart(nextDate).getTime() - 1);
}

export function getPublicEditMessage(row: Pick<PublicAccessRow, "status" | "checkInAt" | "validFrom" | "cancelledAt" | "rejectedAt">, now = new Date()): string | null {
  if (row.cancelledAt || row.rejectedAt || [VISIT_STATUS.CANCELLED, VISIT_STATUS.REJECTED].includes(row.status as typeof VISIT_STATUS.CANCELLED)) {
    return "Diese Voranmeldung wurde widerrufen und kann nicht mehr geändert werden.";
  }
  if (row.checkInAt || row.status !== VISIT_STATUS.PRE_REGISTERED) {
    return "Diese Voranmeldung kann nach dem Check-in nicht mehr geändert werden.";
  }
  if (now >= getGermanVisitDayStart(row.validFrom)) {
    return "Diese Voranmeldung kann ab Beginn des Besuchstags nicht mehr geändert werden.";
  }
  return null;
}

function formatExpectedArrival(value: Date | null): string | null {
  if (!value) return null;
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

function toPublicDetail(row: PublicAccessRow, now = new Date()): PublicPreRegistrationDetail {
  const editMessage = getPublicEditMessage(row, now);
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    company: row.company,
    phone: row.phone,
    email: row.email,
    licensePlate: row.licensePlate,
    purpose: row.purpose,
    hostName: row.hostName,
    hostPhone: row.hostPhone,
    hostDepartment: row.hostDepartment,
    validFrom: row.validFrom.toISOString().slice(0, 10),
    validUntil: row.validUntil.toISOString().slice(0, 10),
    expectedArrivalTime: formatExpectedArrival(row.expectedArrivalTime),
    gateName: row.gateName,
    gateLocation: row.gateLocation,
    status: row.status,
    editable: editMessage === null,
    editMessage,
    recipientUpdatedAt: row.recipientUpdatedAt?.toISOString() ?? null,
    version: createPublicRecordVersion(row.visitUpdatedAt, row.visitorUpdatedAt)
  };
}

function publicAccessQuery(lockRows = false): string {
  const lock = lockRows ? "WITH (UPDLOCK, HOLDLOCK)" : "";
  return `
    SELECT TOP 1
      t.id AS tokenId,
      vt.id AS visitId,
      vis.id AS visitorId,
      t.expires_at AS expiresAt,
      t.revoked_at AS revokedAt,
      vis.first_name AS firstName,
      vis.last_name AS lastName,
      vis.company,
      vis.phone_optional AS phone,
      vis.email_optional AS email,
      vt.license_plate AS licensePlate,
      vt.purpose,
      vt.host_name AS hostName,
      vt.host_phone AS hostPhone,
      vt.host_department AS hostDepartment,
      vt.valid_from AS validFrom,
      vt.valid_until AS validUntil,
      vt.expected_arrival_time AS expectedArrivalTime,
      g.name AS gateName,
      g.location AS gateLocation,
      vt.status,
      vt.check_in_at AS checkInAt,
      vt.cancelled_at AS cancelledAt,
      vt.rejected_at AS rejectedAt,
      CONVERT(NVARCHAR(33), vt.updated_at, 126) AS visitUpdatedAt,
      CONVERT(NVARCHAR(33), vis.updated_at, 126) AS visitorUpdatedAt,
      vt.public_recipient_updated_at AS recipientUpdatedAt
    FROM dbo.public_visit_access_tokens t ${lock}
    INNER JOIN dbo.visits vt ${lock} ON vt.id = t.visit_id
    INNER JOIN dbo.visitors vis ${lock} ON vis.id = vt.visitor_id
    LEFT JOIN dbo.gates g ON g.id = vt.gate_id
    WHERE t.token_hash = @tokenHash
  `;
}

function assertReadable(row: PublicAccessRow | undefined, now = new Date()): asserts row is PublicAccessRow {
  if (!row) throw new PublicAccessError("not_found");
  if (row.revokedAt || row.cancelledAt || row.rejectedAt || [VISIT_STATUS.CANCELLED, VISIT_STATUS.REJECTED].includes(row.status as typeof VISIT_STATUS.CANCELLED)) {
    throw new PublicAccessError("revoked");
  }
  if (now > row.expiresAt) throw new PublicAccessError("expired");
}

export async function createPublicVisitAccessToken(executor: TokenExecutor, visitId: string, expiresAt: Date): Promise<string> {
  const token = generatePublicAccessToken();
  const request = executor instanceof sql.Transaction ? new sql.Request(executor) : executor.request();
  await request
    .input("visitId", sql.UniqueIdentifier, visitId)
    .input("tokenHash", sql.Char(64), hashPublicAccessToken(token))
    .input("expiresAt", sql.DateTime2, expiresAt)
    .query(`
      INSERT INTO dbo.public_visit_access_tokens(visit_id, token_hash, expires_at)
      VALUES(@visitId, @tokenHash, @expiresAt)
    `);
  return token;
}

export async function issuePublicVisitAccessToken(visitId: string, expiresAt: Date): Promise<string> {
  const pool = await getPool();
  return createPublicVisitAccessToken(pool, visitId, expiresAt);
}

export async function revokePublicVisitAccessToken(token: string): Promise<void> {
  if (!isPlausiblePublicAccessToken(token)) return;
  const pool = await getPool();
  await pool.request()
    .input("tokenHash", sql.Char(64), hashPublicAccessToken(token))
    .query("UPDATE dbo.public_visit_access_tokens SET revoked_at = COALESCE(revoked_at, SYSUTCDATETIME()) WHERE token_hash = @tokenHash");
}

export async function revokeOtherPublicVisitAccessTokens(visitId: string, retainedToken: string): Promise<void> {
  if (!isPlausiblePublicAccessToken(retainedToken)) return;
  const pool = await getPool();
  await pool.request()
    .input("visitId", sql.UniqueIdentifier, visitId)
    .input("tokenHash", sql.Char(64), hashPublicAccessToken(retainedToken))
    .query("UPDATE dbo.public_visit_access_tokens SET revoked_at=COALESCE(revoked_at, SYSUTCDATETIME()) WHERE visit_id=@visitId AND token_hash<>@tokenHash AND revoked_at IS NULL");
}

export async function getPublicPreRegistration(token: string): Promise<PublicPreRegistrationDetail> {
  if (!isPlausiblePublicAccessToken(token)) throw new PublicAccessError("not_found");
  const pool = await getPool();
  const result = await pool.request()
    .input("tokenHash", sql.Char(64), hashPublicAccessToken(token))
    .query<PublicAccessRow>(publicAccessQuery());
  const row = result.recordset[0];
  assertReadable(row);
  return toPublicDetail(row);
}

const visitorFields = new Set(["firstName", "lastName", "company", "phone", "email"]);
const visitFields = new Set(["licensePlate", "purpose", "hostName", "hostPhone", "hostDepartment"]);

function normalizedUpdateValue(field: keyof PublicPreRegistrationUpdate, value: string | null | undefined): string | null {
  const cleaned = cleanOptional(value);
  return field === "email" ? cleaned?.toLowerCase() ?? null : cleaned;
}

export async function updatePublicPreRegistration(
  token: string,
  input: PublicPreRegistrationUpdate,
  context: { ipAddress?: string | null; userAgent?: string | null }
): Promise<PublicPreRegistrationDetail> {
  if (!isPlausiblePublicAccessToken(token)) throw new PublicAccessError("not_found");
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  let committed = false;
  await transaction.begin();
  try {
    const request = new sql.Request(transaction).input("tokenHash", sql.Char(64), hashPublicAccessToken(token));
    const result = await request.query<PublicAccessRow>(publicAccessQuery(true));
    const row = result.recordset[0];
    assertReadable(row);
    const editMessage = getPublicEditMessage(row);
    if (editMessage) throw new PublicAccessError("not_editable");
    if (!crypto.timingSafeEqual(Buffer.from(input.version), Buffer.from(createPublicRecordVersion(row.visitUpdatedAt, row.visitorUpdatedAt)))) {
      throw new PublicAccessError("conflict");
    }

    const currentValues: Record<string, string | null> = {
      firstName: row.firstName, lastName: row.lastName, company: row.company, phone: row.phone, email: row.email,
      licensePlate: row.licensePlate, purpose: row.purpose, hostName: row.hostName, hostPhone: row.hostPhone, hostDepartment: row.hostDepartment
    };
    const changedFields = (Object.keys(input) as Array<keyof PublicPreRegistrationUpdate>)
      .filter((field) => field !== "version" && normalizedUpdateValue(field, input[field]) !== normalizedUpdateValue(field, currentValues[field]));
    if (changedFields.length === 0) {
      await transaction.commit();
      committed = true;
      return toPublicDetail(row);
    }
    const visitorChanged = changedFields.some((field) => visitorFields.has(field));
    const visitChanged = changedFields.some((field) => visitFields.has(field));

    if (visitorChanged) {
      await new sql.Request(transaction)
        .input("visitorId", sql.UniqueIdentifier, row.visitorId)
        .input("firstName", sql.NVarChar(120), input.firstName === undefined ? row.firstName : cleanOptional(input.firstName))
        .input("lastName", sql.NVarChar(120), input.lastName === undefined ? row.lastName : cleanOptional(input.lastName))
        .input("company", sql.NVarChar(255), input.company === undefined ? row.company : cleanOptional(input.company))
        .input("phone", sql.NVarChar(80), input.phone === undefined ? row.phone : cleanOptional(input.phone))
        .input("email", sql.NVarChar(255), input.email === undefined ? row.email : cleanOptional(input.email)?.toLowerCase() ?? null)
        .query(`UPDATE dbo.visitors SET first_name=@firstName, last_name=@lastName, company=@company, phone_optional=@phone, email_optional=@email, updated_at=SYSUTCDATETIME() WHERE id=@visitorId`);
    }

    if (visitChanged || visitorChanged) {
      await new sql.Request(transaction)
        .input("visitId", sql.UniqueIdentifier, row.visitId)
        .input("licensePlate", sql.NVarChar(40), input.licensePlate === undefined ? row.licensePlate : cleanOptional(input.licensePlate))
        .input("purpose", sql.NVarChar(500), input.purpose === undefined ? row.purpose : cleanOptional(input.purpose))
        .input("hostName", sql.NVarChar(255), input.hostName === undefined ? row.hostName : cleanOptional(input.hostName))
        .input("hostPhone", sql.NVarChar(80), input.hostPhone === undefined ? row.hostPhone : cleanOptional(input.hostPhone))
        .input("hostDepartment", sql.NVarChar(255), input.hostDepartment === undefined ? row.hostDepartment : cleanOptional(input.hostDepartment))
        .query(`UPDATE dbo.visits SET license_plate=@licensePlate, purpose=@purpose, host_name=@hostName, host_phone=@hostPhone, host_department=@hostDepartment, public_recipient_updated_at=SYSUTCDATETIME(), updated_at=SYSUTCDATETIME() WHERE id=@visitId`);
    }

    await writeAuditLog({
      user: "public:confirmation-link",
      action: "public_preregistration_updated",
      objectType: "visit",
      objectId: row.visitId,
      ipAddress: cleanOptional(context.ipAddress ?? undefined),
      userAgent: cleanOptional(context.userAgent ?? undefined),
      metadata: { changed_fields: changedFields, result: "success", source: "public_confirmation_link" }
    }, transaction);

    await transaction.commit();
    committed = true;
  } catch (error) {
    if (!committed) await transaction.rollback();
    throw error;
  }
  return getPublicPreRegistration(token);
}
