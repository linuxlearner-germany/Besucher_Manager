import sql from "mssql";
import { writeAuditLog } from "./auditLog";
import { getCountryName } from "./countries";
import { getPool } from "./db";
import type { SimplifiedRegistrationImportRow } from "./simplifiedRegistrationExcel";
import { buildSimplifiedRequestNumber, deriveSimplifiedRequestStatus, generateSimplifiedRegistrationToken, hashSimplifiedRegistrationToken, verifySimplifiedRegistrationToken, type SimplifiedEntryStatus } from "./simplifiedRegistrationModel";
import { cleanOptional } from "./textValues";
import type { AuthenticatedUser } from "./visitWorkflow";

export class SimplifiedRegistrationConflictError extends Error {
  constructor() { super("simplified_registration_version_conflict"); }
}
export class SimplifiedRegistrationValidationError extends Error {
  constructor(public readonly messages: string[]) { super("invalid_simplified_registration"); }
}

export type SimplifiedRegistrationEntryRow = {
  id: string; requestId: string; visitorId: string; firstName: string; lastName: string; company: string;
  nationalityCode: string; nationalityName?: string | null; phone: string | null; email: string | null;
  visitorStreet: string | null; visitorHouseNumber: string | null; visitorPostalCode: string | null; visitorCity: string | null;
  idDocumentType: string | null; idDocumentValidUntil: string | null; idDocumentNumber?: string | null;
  barracksAreaId: string; barracksAreaName: string; gateId: string | null; gateName: string | null;
  proposedValidFrom: string; proposedValidUntil: string; finalValidFrom: string | null; finalValidUntil: string | null;
  status: SimplifiedEntryStatus; rejectionReason: string | null; licensePlate: string | null; hostName: string | null;
  hostEmail: string | null; hostPhone: string | null; hostDepartment: string | null; purpose: string | null; notes: string | null;
  version: number; approvedAt: string | null; rejectedAt: string | null; revokedAt: string | null;
};

async function refreshRequestStatus(requestId: string, transaction?: sql.Transaction): Promise<string> {
  const request = transaction ? new sql.Request(transaction) : (await getPool()).request();
  const result = await request.input("requestId", sql.UniqueIdentifier, requestId)
    .query<{ status: SimplifiedEntryStatus }>("SELECT status FROM dbo.simplified_registration_entries WHERE request_id = @requestId");
  const status = deriveSimplifiedRequestStatus(result.recordset.map((entry) => entry.status));
  const updater = transaction ? new sql.Request(transaction) : (await getPool()).request();
  await updater.input("requestId", sql.UniqueIdentifier, requestId).input("status", sql.NVarChar(32), status)
    .query("UPDATE dbo.simplified_registration_requests SET status = @status, updated_at = SYSUTCDATETIME() WHERE id = @requestId");
  return status;
}

export async function listBarracksAreas(includeInactive = false) {
  const result = await (await getPool()).request().query<{
    id: string; name: string; description: string | null; isActive: boolean; sortOrder: number;
    gateId: string | null; gateName: string | null; gateIsActive: boolean | null;
  }>(`
    SELECT a.id, a.name, a.description, a.is_active AS isActive, a.sort_order AS sortOrder,
      g.id AS gateId, g.name AS gateName, g.is_active AS gateIsActive
    FROM dbo.barracks_areas a
    LEFT JOIN dbo.gates g ON g.barracks_area_id = a.id
    ${includeInactive ? "" : "WHERE a.is_active = 1"}
    ORDER BY a.sort_order, a.name, g.sort_order, g.name
  `);
  const areas = new Map<string, { id: string; name: string; description: string | null; isActive: boolean; sortOrder: number; gates: Array<{ id: string; name: string; isActive: boolean }> }>();
  for (const row of result.recordset) {
    const area = areas.get(row.id) ?? { id: row.id, name: row.name, description: row.description, isActive: row.isActive, sortOrder: row.sortOrder, gates: [] };
    if (row.gateId && row.gateName) area.gates.push({ id: row.gateId, name: row.gateName, isActive: Boolean(row.gateIsActive) });
    areas.set(row.id, area);
  }
  return [...areas.values()];
}

export async function createSimplifiedRegistrationRequest(rows: SimplifiedRegistrationImportRow[], input: {
  applicantEmail: string; sourceFilename: string; ipAddress?: string | null; userAgent?: string | null;
}) {
  const areas = await listBarracksAreas(false);
  const normalizedAreas = new Map(areas.map((area) => [area.name.trim().toLowerCase(), area]));
  const resolved = rows.map((row) => {
    const area = normalizedAreas.get(row.barracksAreaName.trim().toLowerCase());
    const gate = row.gateName && area ? area.gates.find((entry) => entry.isActive && entry.name.trim().toLowerCase() === row.gateName.trim().toLowerCase()) : null;
    return { row, area, gate };
  });
  const errors = resolved.flatMap(({ row, area, gate }) => [
    ...(!area ? [`Zeile ${row.sourceRow}: Kasernenbereich „${row.barracksAreaName}“ ist nicht verfügbar.`] : []),
    ...(row.gateName && !gate ? [`Zeile ${row.sourceRow}: Wache „${row.gateName}“ gehört nicht zum gewählten aktiven Kasernenbereich.`] : [])
  ]);
  if (errors.length) throw new SimplifiedRegistrationValidationError(errors);

  const token = generateSimplifiedRegistrationToken();
  const tokenHash = hashSimplifiedRegistrationToken(token);
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const sequenceResult = await new sql.Request(transaction).query<{ sequence: number }>("SELECT NEXT VALUE FOR dbo.simplified_registration_request_number_seq AS sequence");
    const requestNumber = buildSimplifiedRequestNumber(sequenceResult.recordset[0].sequence);
    const createdRequest = await new sql.Request(transaction)
      .input("requestNumber", sql.NVarChar(32), requestNumber).input("tokenHash", sql.Char(64), tokenHash)
      .input("applicantEmail", sql.NVarChar(255), input.applicantEmail.trim().toLowerCase())
      .input("sourceFilename", sql.NVarChar(255), input.sourceFilename.slice(0, 255))
      .input("entryCount", sql.Int, rows.length).input("ipAddress", sql.NVarChar(64), input.ipAddress ?? null)
      .input("userAgent", sql.NVarChar(500), input.userAgent ?? null)
      .query<{ id: string }>(`INSERT INTO dbo.simplified_registration_requests(request_number, token_hash, applicant_email, source_filename, entry_count, submitted_ip_address, user_agent)
        OUTPUT inserted.id VALUES(@requestNumber, @tokenHash, @applicantEmail, @sourceFilename, @entryCount, @ipAddress, @userAgent)`);
    const requestId = createdRequest.recordset[0].id;
    const entries: Array<{ id: string; entryId: string; visitorName: string; nationalityCode: string; company: string; areaName: string; gateName: string | null; proposedValidFrom: string; proposedValidUntil: string }> = [];
    for (const item of resolved) {
      const row = item.row;
      const visitor = await new sql.Request(transaction)
        .input("firstName", sql.NVarChar(120), row.firstName).input("lastName", sql.NVarChar(120), row.lastName)
        .input("company", sql.NVarChar(255), row.company).input("nationalityCode", sql.NChar(2), row.nationalityCode)
        .input("phone", sql.NVarChar(80), cleanOptional(row.phone)).input("email", sql.NVarChar(255), cleanOptional(row.email))
        .input("street", sql.NVarChar(255), cleanOptional(row.street)).input("houseNumber", sql.NVarChar(40), cleanOptional(row.houseNumber))
        .input("postalCode", sql.NVarChar(20), cleanOptional(row.postalCode)).input("city", sql.NVarChar(120), cleanOptional(row.city))
        .input("idDocumentType", sql.NVarChar(40), cleanOptional(row.idDocumentType)).input("idDocumentValidUntil", sql.Date, cleanOptional(row.idDocumentValidUntil))
        .input("idDocumentNumber", sql.NVarChar(120), cleanOptional(row.idDocumentNumber))
        .query<{ id: string }>(`INSERT INTO dbo.visitors(first_name,last_name,company,nationality_code,phone_optional,email_optional,visitor_street,visitor_house_number,visitor_postal_code,visitor_city,id_document_type,id_document_valid_until,id_document_number)
          OUTPUT inserted.id VALUES(@firstName,@lastName,@company,@nationalityCode,@phone,@email,@street,@houseNumber,@postalCode,@city,@idDocumentType,@idDocumentValidUntil,@idDocumentNumber)`);
      const entry = await new sql.Request(transaction)
        .input("requestId", sql.UniqueIdentifier, requestId).input("visitorId", sql.UniqueIdentifier, visitor.recordset[0].id)
        .input("areaId", sql.UniqueIdentifier, item.area!.id).input("gateId", sql.UniqueIdentifier, item.gate?.id ?? null)
        .input("from", sql.Date, row.proposedValidFrom).input("until", sql.Date, row.proposedValidUntil)
        .input("licensePlate", sql.NVarChar(40), cleanOptional(row.licensePlate)).input("hostName", sql.NVarChar(255), cleanOptional(row.hostName))
        .input("hostEmail", sql.NVarChar(255), cleanOptional(row.hostEmail)).input("hostPhone", sql.NVarChar(80), cleanOptional(row.hostPhone))
        .input("hostDepartment", sql.NVarChar(255), cleanOptional(row.hostDepartment)).input("purpose", sql.NVarChar(500), cleanOptional(row.purpose))
        .input("notes", sql.NVarChar(4000), cleanOptional(row.notes))
        .query<{ id: string }>(`INSERT INTO dbo.simplified_registration_entries(request_id,visitor_id,barracks_area_id,gate_id,proposed_valid_from,proposed_valid_until,license_plate,host_name,host_email,host_phone,host_department,purpose,notes)
          OUTPUT inserted.id VALUES(@requestId,@visitorId,@areaId,@gateId,@from,@until,@licensePlate,@hostName,@hostEmail,@hostPhone,@hostDepartment,@purpose,@notes)`);
      entries.push({ id: entry.recordset[0].id, entryId: entry.recordset[0].id, visitorName: `${row.firstName} ${row.lastName}`, nationalityCode: row.nationalityCode, company: row.company, areaName: item.area!.name, gateName: item.gate?.name ?? null, proposedValidFrom: row.proposedValidFrom, proposedValidUntil: row.proposedValidUntil });
    }
    await writeAuditLog({ user: `public:${input.applicantEmail}`, action: "SIMPLIFIED_REGISTRATION_EXCEL_UPLOADED", objectType: "simplified_registration_request", objectId: requestId, ipAddress: input.ipAddress, userAgent: input.userAgent, metadata: { requestNumber, entryCount: entries.length, source: "public_excel" } }, transaction);
    await writeAuditLog({ user: `public:${input.applicantEmail}`, action: "SIMPLIFIED_REGISTRATION_CREATED", objectType: "simplified_registration_request", objectId: requestId, ipAddress: input.ipAddress, userAgent: input.userAgent, metadata: { requestNumber, entryCount: entries.length } }, transaction);
    for (const importedEntry of entries) {
      await writeAuditLog({ user: `public:${input.applicantEmail}`, action: "SIMPLIFIED_REGISTRATION_VISITOR_IMPORTED", objectType: "simplified_registration_entry", objectId: importedEntry.id, ipAddress: input.ipAddress, userAgent: input.userAgent, metadata: { requestId, requestNumber, nationalityCode: importedEntry.nationalityCode } }, transaction);
    }
    await transaction.commit();
    return { requestId, requestNumber, token, entries };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

const entrySelect = `SELECT e.id, e.request_id AS requestId, e.visitor_id AS visitorId, vis.first_name AS firstName, vis.last_name AS lastName, vis.company,
  vis.nationality_code AS nationalityCode, vis.phone_optional AS phone, vis.email_optional AS email, vis.visitor_street AS visitorStreet,
  vis.visitor_house_number AS visitorHouseNumber, vis.visitor_postal_code AS visitorPostalCode, vis.visitor_city AS visitorCity,
  vis.id_document_type AS idDocumentType, CONVERT(NVARCHAR(10),vis.id_document_valid_until,23) AS idDocumentValidUntil, vis.id_document_number AS idDocumentNumber,
  e.barracks_area_id AS barracksAreaId, a.name AS barracksAreaName, e.gate_id AS gateId, g.name AS gateName,
  CONVERT(NVARCHAR(10),e.proposed_valid_from,23) AS proposedValidFrom, CONVERT(NVARCHAR(10),e.proposed_valid_until,23) AS proposedValidUntil,
  CONVERT(NVARCHAR(10),e.final_valid_from,23) AS finalValidFrom, CONVERT(NVARCHAR(10),e.final_valid_until,23) AS finalValidUntil,
  e.status, e.rejection_reason AS rejectionReason, e.license_plate AS licensePlate, e.host_name AS hostName, e.host_email AS hostEmail,
  e.host_phone AS hostPhone, e.host_department AS hostDepartment, e.purpose, e.notes, e.version,
  CONVERT(NVARCHAR(30),e.approved_at,127) AS approvedAt, CONVERT(NVARCHAR(30),e.rejected_at,127) AS rejectedAt, CONVERT(NVARCHAR(30),e.revoked_at,127) AS revokedAt
  FROM dbo.simplified_registration_entries e INNER JOIN dbo.visitors vis ON vis.id=e.visitor_id
  INNER JOIN dbo.barracks_areas a ON a.id=e.barracks_area_id LEFT JOIN dbo.gates g ON g.id=e.gate_id`;

function decorateEntries(entries: SimplifiedRegistrationEntryRow[]) {
  return entries.map((entry) => ({ ...entry, nationalityName: getCountryName(entry.nationalityCode), idDocumentNumber: undefined }));
}

export async function getPublicSimplifiedRegistrationStatus(requestNumber: string, token: string) {
  const request = await (await getPool()).request().input("requestNumber", sql.NVarChar(32), requestNumber.trim().toUpperCase())
    .query<{ id: string; requestNumber: string; tokenHash: string; status: string; createdAt: string }>(`SELECT id,request_number AS requestNumber,token_hash AS tokenHash,status,CONVERT(NVARCHAR(30),created_at,127) AS createdAt FROM dbo.simplified_registration_requests WHERE request_number=@requestNumber`);
  const found = request.recordset[0];
  const comparisonHash = found?.tokenHash ?? hashSimplifiedRegistrationToken("invalid-public-status-token");
  if (!verifySimplifiedRegistrationToken(token, comparisonHash) || !found) return null;
  const entries = await (await getPool()).request().input("requestId", sql.UniqueIdentifier, found.id)
    .query<SimplifiedRegistrationEntryRow>(`${entrySelect} WHERE e.request_id=@requestId ORDER BY vis.last_name,vis.first_name`);
  return { requestNumber: found.requestNumber, status: found.status, createdAt: found.createdAt, entries: decorateEntries(entries.recordset).map((entry) => ({ id: entry.id, firstName: entry.firstName, lastName: entry.lastName, company: entry.company, nationalityCode: entry.nationalityCode, nationalityName: entry.nationalityName, status: entry.status, finalValidFrom: entry.finalValidFrom, finalValidUntil: entry.finalValidUntil, rejectionReason: entry.rejectionReason, barracksAreaName: entry.barracksAreaName, gateName: entry.gateName })) };
}

export async function listSimplifiedRegistrationRequests(status?: string) {
  const request = (await getPool()).request();
  const where = status && status !== "all" ? "WHERE r.status=@status" : "";
  if (where) request.input("status", sql.NVarChar(32), status);
  const result = await request.query(`SELECT r.id,r.request_number AS requestNumber,r.applicant_email AS applicantEmail,r.status,r.entry_count AS entryCount,
    CONVERT(NVARCHAR(30),r.created_at,127) AS createdAt,CONVERT(NVARCHAR(30),r.updated_at,127) AS updatedAt,
    SUM(CASE WHEN e.status='pending' THEN 1 ELSE 0 END) AS pendingCount,SUM(CASE WHEN e.status='approved' THEN 1 ELSE 0 END) AS approvedCount,
    SUM(CASE WHEN e.status='rejected' THEN 1 ELSE 0 END) AS rejectedCount,SUM(CASE WHEN e.status='revoked' THEN 1 ELSE 0 END) AS revokedCount
    FROM dbo.simplified_registration_requests r INNER JOIN dbo.simplified_registration_entries e ON e.request_id=r.id ${where}
    GROUP BY r.id,r.request_number,r.applicant_email,r.status,r.entry_count,r.created_at,r.updated_at ORDER BY r.created_at DESC`);
  return result.recordset;
}

export async function getSimplifiedRegistrationRequest(id: string) {
  const pool = await getPool();
  const request = await pool.request().input("id", sql.UniqueIdentifier, id).query(`SELECT id,request_number AS requestNumber,applicant_email AS applicantEmail,status,entry_count AS entryCount,source_filename AS sourceFilename,CONVERT(NVARCHAR(30),created_at,127) AS createdAt,CONVERT(NVARCHAR(30),updated_at,127) AS updatedAt FROM dbo.simplified_registration_requests WHERE id=@id`);
  if (!request.recordset[0]) return null;
  const entries = await pool.request().input("requestId", sql.UniqueIdentifier, id).query<SimplifiedRegistrationEntryRow>(`${entrySelect} WHERE e.request_id=@requestId ORDER BY vis.last_name,vis.first_name`);
  return { ...request.recordset[0], entries: entries.recordset.map((entry) => ({ ...entry, nationalityName: getCountryName(entry.nationalityCode) })) };
}

export async function updateSimplifiedRegistrationEntry(user: AuthenticatedUser, requestId: string, entryId: string, data: Record<string, unknown>) {
  const version = Number(data.version);
  const pool = await getPool(); const tx = new sql.Transaction(pool); await tx.begin();
  try {
    const current = await new sql.Request(tx).input("entryId", sql.UniqueIdentifier, entryId).input("requestId", sql.UniqueIdentifier, requestId).query<{ visitorId: string; version: number; barracksAreaId:string; gateId:string|null; finalValidFrom:string|null; finalValidUntil:string|null; rejectionReason:string|null }>("SELECT visitor_id AS visitorId,version,barracks_area_id AS barracksAreaId,gate_id AS gateId,CONVERT(NVARCHAR(10),final_valid_from,23) AS finalValidFrom,CONVERT(NVARCHAR(10),final_valid_until,23) AS finalValidUntil,rejection_reason AS rejectionReason FROM dbo.simplified_registration_entries WITH (UPDLOCK) WHERE id=@entryId AND request_id=@requestId");
    const entry = current.recordset[0]; if (!entry) return null; if (entry.version !== version) throw new SimplifiedRegistrationConflictError();
    const areaId = String(data.barracksAreaId ?? ""); const gateId = cleanOptional(String(data.gateId ?? ""));
    const scope = await new sql.Request(tx).input("areaId", sql.UniqueIdentifier, areaId).input("gateId", sql.UniqueIdentifier, gateId).query<{ areaOk: number; gateOk: number }>(`SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.barracks_areas WHERE id=@areaId AND is_active=1) THEN 1 ELSE 0 END AS areaOk, CASE WHEN @gateId IS NULL OR EXISTS(SELECT 1 FROM dbo.gates WHERE id=@gateId AND barracks_area_id=@areaId AND is_active=1) THEN 1 ELSE 0 END AS gateOk`);
    if (!scope.recordset[0]?.areaOk || !scope.recordset[0]?.gateOk) throw new SimplifiedRegistrationValidationError(["Kasernenbereich oder Wache ist nicht verfügbar."]);
    await new sql.Request(tx).input("visitorId",sql.UniqueIdentifier,entry.visitorId).input("firstName",sql.NVarChar(120),String(data.firstName??"").trim()).input("lastName",sql.NVarChar(120),String(data.lastName??"").trim()).input("company",sql.NVarChar(255),String(data.company??"").trim()).input("nationality",sql.NChar(2),String(data.nationalityCode??"").trim()).input("phone",sql.NVarChar(80),cleanOptional(String(data.phone??""))).input("email",sql.NVarChar(255),cleanOptional(String(data.email??""))).input("street",sql.NVarChar(255),cleanOptional(String(data.visitorStreet??""))).input("houseNumber",sql.NVarChar(40),cleanOptional(String(data.visitorHouseNumber??""))).input("postalCode",sql.NVarChar(20),cleanOptional(String(data.visitorPostalCode??""))).input("city",sql.NVarChar(120),cleanOptional(String(data.visitorCity??""))).input("idType",sql.NVarChar(40),cleanOptional(String(data.idDocumentType??""))).input("idUntil",sql.Date,cleanOptional(String(data.idDocumentValidUntil??""))).input("idNumber",sql.NVarChar(120),cleanOptional(String(data.idDocumentNumber??""))).query("UPDATE dbo.visitors SET first_name=@firstName,last_name=@lastName,company=@company,nationality_code=@nationality,phone_optional=@phone,email_optional=@email,visitor_street=@street,visitor_house_number=@houseNumber,visitor_postal_code=@postalCode,visitor_city=@city,id_document_type=@idType,id_document_valid_until=@idUntil,id_document_number=@idNumber,updated_at=SYSUTCDATETIME() WHERE id=@visitorId");
    const updated = await new sql.Request(tx).input("entryId",sql.UniqueIdentifier,entryId).input("version",sql.Int,version).input("areaId",sql.UniqueIdentifier,areaId).input("gateId",sql.UniqueIdentifier,gateId).input("from",sql.Date,cleanOptional(String(data.finalValidFrom??""))).input("until",sql.Date,cleanOptional(String(data.finalValidUntil??""))).input("reason",sql.NVarChar(1000),cleanOptional(String(data.rejectionReason??""))).input("license",sql.NVarChar(40),cleanOptional(String(data.licensePlate??""))).input("hostName",sql.NVarChar(255),cleanOptional(String(data.hostName??""))).input("hostPhone",sql.NVarChar(80),cleanOptional(String(data.hostPhone??""))).input("hostEmail",sql.NVarChar(255),cleanOptional(String(data.hostEmail??""))).input("hostDepartment",sql.NVarChar(255),cleanOptional(String(data.hostDepartment??""))).input("purpose",sql.NVarChar(500),cleanOptional(String(data.purpose??""))).input("notes",sql.NVarChar(4000),cleanOptional(String(data.notes??""))).query("UPDATE dbo.simplified_registration_entries SET barracks_area_id=@areaId,gate_id=@gateId,final_valid_from=@from,final_valid_until=@until,rejection_reason=@reason,license_plate=@license,host_name=@hostName,host_phone=@hostPhone,host_email=@hostEmail,host_department=@hostDepartment,purpose=@purpose,notes=@notes,version=version+1,updated_at=SYSUTCDATETIME() WHERE id=@entryId AND version=@version");
    if (!updated.rowsAffected[0]) throw new SimplifiedRegistrationConflictError();
    const changes={periodChanged:entry.finalValidFrom!==cleanOptional(String(data.finalValidFrom??""))||entry.finalValidUntil!==cleanOptional(String(data.finalValidUntil??"")),areaChanged:entry.barracksAreaId!==areaId,gateChanged:(entry.gateId??null)!==(gateId??null),rejectionReasonChanged:(entry.rejectionReason??null)!==(cleanOptional(String(data.rejectionReason??""))??null)};
    await writeAuditLog({user:user.username,userId:user.id,action:"SIMPLIFIED_REGISTRATION_ENTRY_UPDATED",objectType:"simplified_registration_entry",objectId:entryId,metadata:{requestId,previousVersion:version,...changes}},tx);
    if(changes.periodChanged)await writeAuditLog({user:user.username,userId:user.id,action:"SIMPLIFIED_REGISTRATION_PERIOD_CHANGED",objectType:"simplified_registration_entry",objectId:entryId,metadata:{requestId}},tx);
    if(changes.areaChanged)await writeAuditLog({user:user.username,userId:user.id,action:"SIMPLIFIED_REGISTRATION_AREA_CHANGED",objectType:"simplified_registration_entry",objectId:entryId,metadata:{requestId}},tx);
    if(changes.gateChanged)await writeAuditLog({user:user.username,userId:user.id,action:"SIMPLIFIED_REGISTRATION_GATE_CHANGED",objectType:"simplified_registration_entry",objectId:entryId,metadata:{requestId}},tx);
    if(changes.rejectionReasonChanged)await writeAuditLog({user:user.username,userId:user.id,action:"SIMPLIFIED_REGISTRATION_REJECTION_REASON_CHANGED",objectType:"simplified_registration_entry",objectId:entryId,metadata:{requestId,reasonProvided:Boolean(data.rejectionReason)}},tx);
    await tx.commit(); return { success:true, version:version+1 };
  } catch(error){await tx.rollback();throw error;}
}

export async function decideSimplifiedRegistrationEntry(user: AuthenticatedUser, requestId: string, entryId: string, action: "approve"|"reject"|"revoke", input: {version:number; finalValidFrom?:string; finalValidUntil?:string; rejectionReason?:string}) {
  const pool=await getPool(); const tx=new sql.Transaction(pool); await tx.begin();
  try {
    const current=await new sql.Request(tx).input("entryId",sql.UniqueIdentifier,entryId).input("requestId",sql.UniqueIdentifier,requestId).query<{version:number;status:SimplifiedEntryStatus}>("SELECT version,status FROM dbo.simplified_registration_entries WITH (UPDLOCK) WHERE id=@entryId AND request_id=@requestId");
    const entry=current.recordset[0]; if(!entry)return null; if(entry.version!==input.version)throw new SimplifiedRegistrationConflictError();
    if(action==="revoke"&&entry.status!=="approved")throw new SimplifiedRegistrationValidationError(["Nur eine genehmigte Freigabe kann widerrufen werden."]);
    const from=input.finalValidFrom; const until=input.finalValidUntil;
    if(action==="approve" && (!from||!until||until<from))throw new SimplifiedRegistrationValidationError(["Für die Genehmigung ist ein gültiger endgültiger Zeitraum erforderlich."]);
    const status=action==="approve"?"approved":action==="reject"?"rejected":"revoked";
    const result=await new sql.Request(tx).input("id",sql.UniqueIdentifier,entryId).input("version",sql.Int,input.version).input("status",sql.NVarChar(32),status).input("from",sql.Date,action==="approve"?from:null).input("until",sql.Date,action==="approve"?until:null).input("reason",sql.NVarChar(1000),cleanOptional(input.rejectionReason)).input("userId",sql.UniqueIdentifier,user.id).query(`UPDATE dbo.simplified_registration_entries SET status=@status,final_valid_from=CASE WHEN @status='approved' THEN @from ELSE final_valid_from END,final_valid_until=CASE WHEN @status='approved' THEN @until ELSE final_valid_until END,rejection_reason=CASE WHEN @status='rejected' THEN @reason ELSE rejection_reason END,approved_by=CASE WHEN @status='approved' THEN @userId ELSE approved_by END,approved_at=CASE WHEN @status='approved' THEN SYSUTCDATETIME() ELSE approved_at END,rejected_by=CASE WHEN @status='rejected' THEN @userId ELSE rejected_by END,rejected_at=CASE WHEN @status='rejected' THEN SYSUTCDATETIME() ELSE rejected_at END,revoked_by=CASE WHEN @status='revoked' THEN @userId ELSE revoked_by END,revoked_at=CASE WHEN @status='revoked' THEN SYSUTCDATETIME() ELSE revoked_at END,version=version+1,updated_at=SYSUTCDATETIME() WHERE id=@id AND version=@version`);
    if(!result.rowsAffected[0])throw new SimplifiedRegistrationConflictError(); const requestStatus=await refreshRequestStatus(requestId,tx);
    const auditAction=action==="approve"?"SIMPLIFIED_REGISTRATION_ENTRY_APPROVED":action==="reject"?"SIMPLIFIED_REGISTRATION_ENTRY_REJECTED":"SIMPLIFIED_REGISTRATION_ENTRY_REVOKED";
    await writeAuditLog({user:user.username,userId:user.id,action:auditAction,objectType:"simplified_registration_entry",objectId:entryId,metadata:{requestId,requestStatus,finalValidFrom:action==="approve"?from:null,finalValidUntil:action==="approve"?until:null,reasonProvided:Boolean(input.rejectionReason)}},tx);
    await tx.commit(); return {success:true,status,requestStatus,version:input.version+1};
  }catch(error){await tx.rollback();throw error;}
}

export async function approveAllSimplifiedRegistrationEntries(user:AuthenticatedUser,requestId:string){
  const pool=await getPool(); const tx=new sql.Transaction(pool); await tx.begin();
  try{const result=await new sql.Request(tx).input("requestId",sql.UniqueIdentifier,requestId).input("userId",sql.UniqueIdentifier,user.id).query("UPDATE dbo.simplified_registration_entries SET status='approved',final_valid_from=proposed_valid_from,final_valid_until=proposed_valid_until,approved_by=@userId,approved_at=SYSUTCDATETIME(),version=version+1,updated_at=SYSUTCDATETIME() WHERE request_id=@requestId AND status='pending'"); const status=await refreshRequestStatus(requestId,tx); await writeAuditLog({user:user.username,userId:user.id,action:"SIMPLIFIED_REGISTRATION_APPROVE_ALL",objectType:"simplified_registration_request",objectId:requestId,metadata:{approvedCount:result.rowsAffected[0]??0,status}},tx); await tx.commit(); return {success:true,approvedCount:result.rowsAffected[0]??0,status};}catch(error){await tx.rollback();throw error;}
}

export async function listGuardSimplifiedVisitors(user:AuthenticatedUser,filters:{search?:string;validity?:string}){
  if(!user.gateId)throw new SimplifiedRegistrationValidationError(["Dem Wachkonto ist keine aktive Wache zugeordnet."]);
  const request=(await getPool()).request().input("gateId",sql.UniqueIdentifier,user.gateId).input("search",sql.NVarChar(255),`%${filters.search?.trim()??""}%`);
  const validity=filters.validity??"current"; const validityClause=validity==="future"?"e.final_valid_from>CAST(SYSUTCDATETIME() AS date)":validity==="expired"?"e.final_valid_until<CAST(SYSUTCDATETIME() AS date)":"e.final_valid_from<=CAST(SYSUTCDATETIME() AS date) AND e.final_valid_until>=CAST(SYSUTCDATETIME() AS date)";
  const result=await request.query<SimplifiedRegistrationEntryRow>(`${entrySelect} INNER JOIN dbo.gates own_gate ON own_gate.id=@gateId WHERE e.status='approved' AND (e.gate_id=@gateId OR (e.gate_id IS NULL AND e.barracks_area_id=own_gate.barracks_area_id)) AND ${validityClause} AND (@search='%%' OR vis.first_name LIKE @search OR vis.last_name LIKE @search OR vis.company LIKE @search OR vis.nationality_code LIKE @search OR e.license_plate LIKE @search OR a.name LIKE @search OR g.name LIKE @search) ORDER BY e.final_valid_until,vis.last_name,vis.first_name`);
  return decorateEntries(result.recordset);
}

export async function getApprovedSimplifiedEntriesForVisitors(user:AuthenticatedUser,visitorIds:string[]){
  if(!user.gateId||!visitorIds.length)return new Map<string,unknown[]>(); const request=(await getPool()).request().input("gateId",sql.UniqueIdentifier,user.gateId); const names=visitorIds.map((id,index)=>{request.input(`id${index}`,sql.UniqueIdentifier,id);return `@id${index}`;});
  const result=await request.query(`${entrySelect} INNER JOIN dbo.gates own_gate ON own_gate.id=@gateId WHERE e.visitor_id IN (${names.join(",")}) AND e.status='approved' AND e.final_valid_from<=CAST(SYSUTCDATETIME() AS date) AND e.final_valid_until>=CAST(SYSUTCDATETIME() AS date) AND (e.gate_id=@gateId OR (e.gate_id IS NULL AND e.barracks_area_id=own_gate.barracks_area_id))`); const grouped=new Map<string,unknown[]>(); for(const row of result.recordset){const items=grouped.get(row.visitorId)??[];items.push({...row,idDocumentNumber:undefined});grouped.set(row.visitorId,items);} return grouped;
}
