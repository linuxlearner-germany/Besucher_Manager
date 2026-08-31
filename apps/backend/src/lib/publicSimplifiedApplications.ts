import crypto from "node:crypto";
import sql from "mssql";
import { env } from "../config/env";
import { writeAuditLog } from "./auditLog";
import { generateUniqueBadgeNumber } from "./badgeAllocation";
import { dateOnlyEnd, dateOnlyStart } from "./dateOnly";
import { getPool } from "./db";
import { writeErrorLog } from "./errorLogs";
import { buildMailHtml, buildPublicSimplifiedVerificationUrl, escapeMailHtml, notifyNationalitySubscribers, sendWorkflowMail } from "./mailRelay";
import type { PublicApplicationPreviewRow } from "./publicSimplifiedXlsx";
import { cleanOptional } from "./textValues";
import type { AuthenticatedUser } from "./visitWorkflow";

export type ApplicationStatus = "pending_email_verification" | "submitted" | "partially_approved" | "approved" | "rejected" | "cancelled";
export type EntryDecision = "approved" | "rejected";
type NationalityNotification = Parameters<typeof notifyNationalitySubscribers>[0];
export class PublicApplicationError extends Error {
  constructor(
    public readonly reason: "not_found" | "expired" | "revoked" | "conflict" | "not_ready" | "mail_unavailable",
    message: string,
    options?: ErrorOptions
  ) { super(message, options); }
}

function versionString(value: Buffer | string): string {
  return Buffer.isBuffer(value) ? value.toString("hex") : String(value).replace(/^0x/i, "").toLowerCase();
}
function versionBuffer(value: string): Buffer {
  const normalized = value.replace(/^0x/i, "");
  if (!/^[0-9a-f]{16}$/i.test(normalized)) throw new PublicApplicationError("conflict", "invalid_version");
  return Buffer.from(normalized, "hex");
}
function tokenHash(token: string): string { return crypto.createHash("sha256").update(token).digest("hex"); }
function period(rows: PublicApplicationPreviewRow[]): string {
  const dates = rows.flatMap((row) => [row.validFrom, row.validUntil]).filter((value): value is string => Boolean(value)).sort();
  return dates.length ? `${dates[0]} bis ${dates.at(-1)}` : "–";
}

type ApplicantInput = { email: string; name?: string | null; organization?: string | null; note?: string | null; clientRequestId?: string | null };

type ExistingApplication = {
  id: string;
  reference: string;
  status: ApplicationStatus;
  emailVerificationRequired: boolean;
  version: Buffer;
  entryCount: number;
};

export async function createPublicSimplifiedApplication(input: ApplicantInput, rows: PublicApplicationPreviewRow[], requireVerification: boolean, context: { ip?: string | null; userAgent?: string | null }) {
  if (!rows.length || rows.some((row) => row.errors.length || !row.gateId || !row.validFrom || !row.validUntil)) throw new Error("invalid_application_rows");
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const clientRequestId = input.clientRequestId ?? crypto.randomUUID();
    const existing = await new sql.Request(transaction)
      .input("clientRequestId", sql.UniqueIdentifier, clientRequestId)
      .query<ExistingApplication>(`
        SELECT a.id, a.public_reference AS reference, a.status,
          a.email_verification_required AS emailVerificationRequired,
          a.[version], COUNT(e.id) AS entryCount
        FROM dbo.public_simplified_applications a WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.public_simplified_application_entries e ON e.application_id = a.id
        WHERE a.client_request_id = @clientRequestId
        GROUP BY a.id, a.public_reference, a.status, a.email_verification_required, a.[version]`);
    const existingApplication = existing.recordset[0];
    if (existingApplication) {
      await transaction.commit();
      return {
        ...existingApplication,
        version: versionString(existingApplication.version),
        entryCount: Number(existingApplication.entryCount)
      };
    }
    const seq = await new sql.Request(transaction).query<{ value: number }>("SELECT NEXT VALUE FOR dbo.public_simplified_application_reference_seq AS value");
    const reference = `VBA-${new Date().getUTCFullYear()}-${String(seq.recordset[0]?.value ?? 0).padStart(6, "0")}`;
    const status: ApplicationStatus = requireVerification ? "pending_email_verification" : "submitted";
    const inserted = await new sql.Request(transaction)
      .input("reference", sql.NVarChar(32), reference).input("email", sql.NVarChar(255), input.email.trim().toLowerCase())
      .input("name", sql.NVarChar(255), cleanOptional(input.name)).input("organization", sql.NVarChar(255), cleanOptional(input.organization))
      .input("note", sql.NVarChar(2000), cleanOptional(input.note)).input("status", sql.NVarChar(40), status)
      .input("required", sql.Bit, requireVerification).input("clientRequestId", sql.UniqueIdentifier, clientRequestId).query<{ id: string; version: Buffer }>(`
        INSERT INTO dbo.public_simplified_applications(public_reference, applicant_email, applicant_name, applicant_organization, applicant_note, status, email_verification_required, submitted_at, client_request_id)
        OUTPUT inserted.id, inserted.[version]
        VALUES(@reference,@email,@name,@organization,@note,@status,@required,CASE WHEN @required=0 THEN SYSUTCDATETIME() ELSE NULL END,@clientRequestId)`);
    const application = inserted.recordset[0];
    if (!application) throw new Error("application_insert_failed");
    for (const row of rows) await insertEntry(transaction, application.id, row);
    await writeAuditLog({ user: "public-xlsx-applicant", action: "PUBLIC_XLSX_APPLICATION_CREATED", objectType: "public_simplified_application", objectId: application.id, ipAddress: context.ip, userAgent: context.userAgent, metadata: { reference, entry_count: rows.length, email_verification_required: requireVerification } }, transaction);
    let verificationToken: string | null = null;
    if (requireVerification) {
      verificationToken = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await new sql.Request(transaction).input("applicationId", sql.UniqueIdentifier, application.id).input("hash", sql.Char(64), tokenHash(verificationToken)).input("expiresAt", sql.DateTime2, expiresAt)
        .query("INSERT INTO dbo.public_simplified_application_verification_tokens(application_id,token_hash,expires_at) VALUES(@applicationId,@hash,@expiresAt)");
      let sent = false;
      try {
        sent = await sendVerificationMail(input.email, reference, verificationToken, expiresAt);
      } catch (error) {
        throw new PublicApplicationError("mail_unavailable", "verification_mail_transport_failed", { cause: error });
      }
      if (!sent) throw new PublicApplicationError("mail_unavailable", "verification_mail_not_sent");
      await new sql.Request(transaction).input("id", sql.UniqueIdentifier, application.id).query("UPDATE dbo.public_simplified_applications SET verification_mail_sent_at=SYSUTCDATETIME(),updated_at=SYSUTCDATETIME() WHERE id=@id");
      await writeAuditLog({ user: "public-xlsx-applicant", action: "PUBLIC_XLSX_EMAIL_VERIFICATION_SENT", objectType: "public_simplified_application", objectId: application.id, ipAddress: context.ip, metadata: { reference, expires_at: expiresAt.toISOString() } }, transaction);
    } else {
      await enqueueSubmittedMails(transaction, application.id, reference, input, rows);
      await writeAuditLog({ user: "public-xlsx-applicant", action: "PUBLIC_XLSX_APPLICATION_SUBMITTED", objectType: "public_simplified_application", objectId: application.id, ipAddress: context.ip, metadata: { reference, entry_count: rows.length } }, transaction);
    }
    await transaction.commit();
    if (!requireVerification) triggerApplicationMailOutbox(application.id);
    return { id: application.id, reference, status, emailVerificationRequired: requireVerification, version: versionString(application.version), entryCount: rows.length };
  } catch (error) { await transaction.rollback(); throw error; }
}

async function insertEntry(transaction: sql.Transaction, applicationId: string, row: PublicApplicationPreviewRow) {
  await new sql.Request(transaction).input("applicationId",sql.UniqueIdentifier,applicationId).input("row",sql.Int,row.rowNumber)
    .input("first",sql.NVarChar(120),row.firstName).input("last",sql.NVarChar(120),row.lastName).input("company",sql.NVarChar(255),row.company)
    .input("nationality",sql.NChar(2),row.nationalityCode).input("birth",sql.Date,row.birthDate).input("phone",sql.NVarChar(80),row.phone).input("email",sql.NVarChar(255),row.email)
    .input("plate",sql.NVarChar(40),row.licensePlate).input("gate",sql.UniqueIdentifier,row.gateId).input("host",sql.NVarChar(255),row.hostName)
    .input("hostPhone",sql.NVarChar(80),row.hostPhone).input("hostEmail",sql.NVarChar(255),row.hostEmail).input("department",sql.NVarChar(255),row.hostDepartment)
    .input("purpose",sql.NVarChar(500),row.purpose).input("from",sql.Date,row.validFrom).input("until",sql.Date,row.validUntil).input("notes",sql.NVarChar(2000),row.notes).query(`
      INSERT INTO dbo.public_simplified_application_entries(application_id,source_row_number,first_name,last_name,company,nationality_code,birth_date,phone,email,license_plate,gate_id,host_name,host_phone,host_email,host_department,purpose,valid_from,valid_until,notes)
      VALUES(@applicationId,@row,@first,@last,@company,@nationality,@birth,@phone,@email,@plate,@gate,@host,@hostPhone,@hostEmail,@department,@purpose,@from,@until,@notes)`);
}

async function sendVerificationMail(to: string, reference: string, token: string, expiresAt: Date): Promise<boolean> {
  const url = buildPublicSimplifiedVerificationUrl(token);
  return sendWorkflowMail({ to:[to], subject:"E-Mail bestätigen – Vereinfachte Besucherregelung", text:[`Antrag zur vereinfachten Besucherregelung ${reference}`,"Bitte bestätigen Sie Ihre E-Mail-Adresse, damit der Antrag an KSKdt weitergeleitet werden kann.",url,`Gültig bis: ${expiresAt.toLocaleString("de-DE",{timeZone:"Europe/Berlin"})}`].join("\n\n"), html:buildMailHtml({heading:"E-Mail-Adresse bestätigen",introduction:"Bitte bestätigen Sie Ihre E-Mail-Adresse, damit Ihr Antrag zur vereinfachten Besucherregelung an KSKdt weitergeleitet werden kann.",details:[{label:"Referenz",value:reference},{label:"Link gültig bis",value:expiresAt.toLocaleString("de-DE",{timeZone:"Europe/Berlin"})}],detailUrl:url,detailLinkLabel:"E-Mail-Adresse bestätigen"}) });
}

async function enqueueSubmittedMails(transaction: sql.Transaction, applicationId: string, reference: string, applicant: ApplicantInput, rows: PublicApplicationPreviewRow[]) {
  await enqueueMail(transaction, applicationId, "applicant-submitted", "submitted", [applicant.email], { reference, count:rows.length, period:period(rows), applicantName:applicant.name ?? null });
  const recipients = await getKaskdtRecipients(transaction);
  if (recipients.length) await enqueueMail(transaction, applicationId, "kaskdt-new-application", "kaskdt_new", recipients, { reference, count:rows.length, period:period(rows), applicantEmail:applicant.email, applicantName:applicant.name ?? null, organization:applicant.organization ?? null, applicationId });
}
async function enqueueMail(transaction: sql.Transaction, applicationId:string, eventKey:string, mailType:string, recipients:string[], payload:Record<string,unknown>) {
  await new sql.Request(transaction).input("applicationId",sql.UniqueIdentifier,applicationId).input("event",sql.NVarChar(120),eventKey).input("type",sql.NVarChar(40),mailType).input("recipients",sql.NVarChar(sql.MAX),JSON.stringify(recipients)).input("payload",sql.NVarChar(sql.MAX),JSON.stringify(payload)).query(`
    IF NOT EXISTS(SELECT 1 FROM dbo.public_simplified_application_mail_outbox WHERE application_id=@applicationId AND event_key=@event)
      INSERT INTO dbo.public_simplified_application_mail_outbox(application_id,event_key,mail_type,recipients_json,payload_json) VALUES(@applicationId,@event,@type,@recipients,@payload)`);
}
async function getKaskdtRecipients(transaction: sql.Transaction): Promise<string[]> {
  const result=await new sql.Request(transaction).query<{email:string}>(`SELECT DISTINCT LOWER(LTRIM(RTRIM(u.user_email))) AS email FROM dbo.users u INNER JOIN dbo.user_roles r ON r.user_id=u.id AND r.role=N'kaskdt' WHERE u.is_active=1 AND ISNULL(u.is_tombstoned,0)=0 AND NULLIF(LTRIM(RTRIM(u.user_email)),N'') IS NOT NULL`);
  return [...new Set(result.recordset.map((row)=>row.email))];
}

export async function verifyPublicSimplifiedApplication(rawToken:string, context:{ip?:string|null;userAgent?:string|null}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) throw new PublicApplicationError("not_found","invalid_token");
  const pool=await getPool(); const tx=new sql.Transaction(pool); await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const result=await new sql.Request(tx).input("hash",sql.Char(64),tokenHash(rawToken)).query<{id:string;applicationId:string;expiresAt:Date;usedAt:Date|null;revokedAt:Date|null;status:ApplicationStatus;reference:string;email:string;name:string|null;organization:string|null}>(`
      SELECT t.id,t.application_id AS applicationId,t.expires_at AS expiresAt,t.used_at AS usedAt,t.revoked_at AS revokedAt,a.status,a.public_reference AS reference,a.applicant_email AS email,a.applicant_name AS name,a.applicant_organization AS organization
      FROM dbo.public_simplified_application_verification_tokens t WITH(UPDLOCK,HOLDLOCK) INNER JOIN dbo.public_simplified_applications a ON a.id=t.application_id WHERE t.token_hash=@hash`);
    const item=result.recordset[0]; if(!item) throw new PublicApplicationError("not_found","token_not_found");
    if(item.revokedAt) throw new PublicApplicationError("revoked","token_revoked");
    if(item.usedAt || item.status!=="pending_email_verification"){await tx.commit();return {reference:item.reference,status:"submitted",alreadyVerified:true};}
    if(item.expiresAt.getTime()<Date.now()) throw new PublicApplicationError("expired","token_expired");
    await new sql.Request(tx).input("tokenId",sql.UniqueIdentifier,item.id).query("UPDATE dbo.public_simplified_application_verification_tokens SET used_at=SYSUTCDATETIME() WHERE id=@tokenId");
    await new sql.Request(tx).input("id",sql.UniqueIdentifier,item.applicationId).query("UPDATE dbo.public_simplified_applications SET status=N'submitted',email_verified_at=SYSUTCDATETIME(),submitted_at=SYSUTCDATETIME(),updated_at=SYSUTCDATETIME() WHERE id=@id");
    const rows=await loadPreviewRows(tx,item.applicationId); await enqueueSubmittedMails(tx,item.applicationId,item.reference,{email:item.email,name:item.name,organization:item.organization},rows);
    await writeAuditLog({user:"public-xlsx-applicant",action:"PUBLIC_XLSX_EMAIL_VERIFIED",objectType:"public_simplified_application",objectId:item.applicationId,ipAddress:context.ip,userAgent:context.userAgent,metadata:{reference:item.reference}},tx);
    await writeAuditLog({user:"public-xlsx-applicant",action:"PUBLIC_XLSX_APPLICATION_SUBMITTED",objectType:"public_simplified_application",objectId:item.applicationId,ipAddress:context.ip,metadata:{reference:item.reference,entry_count:rows.length}},tx);
    await tx.commit(); triggerApplicationMailOutbox(item.applicationId); return {reference:item.reference,status:"submitted",alreadyVerified:false};
  }catch(error){await tx.rollback();throw error;}
}

async function loadPreviewRows(tx:sql.Transaction, applicationId:string):Promise<PublicApplicationPreviewRow[]> {
  const result=await new sql.Request(tx).input("id",sql.UniqueIdentifier,applicationId).query<any>(`SELECT e.source_row_number AS rowNumber,e.first_name AS firstName,e.last_name AS lastName,e.company,e.nationality_code AS nationalityCode,CONVERT(NVARCHAR(10),e.birth_date,23) AS birthDate,e.phone,e.email,e.license_plate AS licensePlate,e.gate_id AS gateId,g.name AS gateName,e.host_name AS hostName,e.host_phone AS hostPhone,e.host_email AS hostEmail,e.host_department AS hostDepartment,e.purpose,CONVERT(NVARCHAR(10),e.valid_from,23) AS validFrom,CONVERT(NVARCHAR(10),e.valid_until,23) AS validUntil,e.notes FROM dbo.public_simplified_application_entries e INNER JOIN dbo.gates g ON g.id=e.gate_id WHERE e.application_id=@id ORDER BY e.source_row_number`);
  return result.recordset.map((row:any)=>({...row,warnings:[],errors:[]}));
}

export async function listKaskdtApplications(filters:{status?:string;search?:string;from?:string;to?:string;page:number;pageSize:number}) {
  const pool=await getPool(); const request=pool.request().input("offset",sql.Int,(filters.page-1)*filters.pageSize).input("limit",sql.Int,filters.pageSize).input("status",sql.NVarChar(40),filters.status||null).input("search",sql.NVarChar(300),filters.search?`%${filters.search}%`:null).input("from",sql.Date,filters.from||null).input("to",sql.Date,filters.to||null);
  const where=`a.submitted_at IS NOT NULL AND a.status<>N'cancelled' AND (@status IS NULL OR a.status=@status OR (@status=N'open' AND EXISTS(SELECT 1 FROM dbo.public_simplified_application_entries oe WHERE oe.application_id=a.id AND oe.status=N'pending'))) AND (@search IS NULL OR a.public_reference LIKE @search OR a.applicant_name LIKE @search OR a.applicant_email LIKE @search OR EXISTS(SELECT 1 FROM dbo.public_simplified_application_entries se WHERE se.application_id=a.id AND CONCAT(ISNULL(se.first_name,N''),N' ',ISNULL(se.last_name,N'')) LIKE @search)) AND (@from IS NULL OR EXISTS(SELECT 1 FROM dbo.public_simplified_application_entries fe WHERE fe.application_id=a.id AND fe.valid_until>=@from)) AND (@to IS NULL OR EXISTS(SELECT 1 FROM dbo.public_simplified_application_entries te WHERE te.application_id=a.id AND te.valid_from<=@to))`;
  const result=await request.query<any>(`SELECT COUNT(*) OVER() AS total,a.id,a.public_reference AS reference,a.applicant_email AS applicantEmail,a.applicant_name AS applicantName,a.applicant_organization AS applicantOrganization,a.status,a.submitted_at AS submittedAt,sys.fn_varbintohexstr(a.[version]) AS version,MIN(e.valid_from) AS validFrom,MAX(e.valid_until) AS validUntil,COUNT(*) AS personCount,SUM(CASE WHEN e.status=N'pending' THEN 1 ELSE 0 END) AS pendingCount,SUM(CASE WHEN e.status=N'approved' THEN 1 ELSE 0 END) AS approvedCount,SUM(CASE WHEN e.status=N'rejected' THEN 1 ELSE 0 END) AS rejectedCount FROM dbo.public_simplified_applications a INNER JOIN dbo.public_simplified_application_entries e ON e.application_id=a.id WHERE ${where} GROUP BY a.id,a.public_reference,a.applicant_email,a.applicant_name,a.applicant_organization,a.status,a.submitted_at,a.[version] ORDER BY CASE WHEN SUM(CASE WHEN e.status=N'pending' THEN 1 ELSE 0 END)>0 THEN 0 ELSE 1 END,a.submitted_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
  return {applications:result.recordset.map((row:any)=>({...row,total:undefined,version:String(row.version).toLowerCase()})),total:Number(result.recordset[0]?.total??0),page:filters.page,pageSize:filters.pageSize};
}

export async function getKaskdtApplication(id:string, tx?:sql.Transaction) {
  const request=tx?new sql.Request(tx):(await getPool()).request();
  const app=await request.input("id",sql.UniqueIdentifier,id).query<any>(`SELECT id,public_reference AS reference,applicant_email AS applicantEmail,applicant_name AS applicantName,applicant_organization AS applicantOrganization,applicant_note AS applicantNote,status,email_verification_required AS emailVerificationRequired,email_verified_at AS emailVerifiedAt,submitted_at AS submittedAt,decided_at AS decidedAt,finalized_at AS finalizedAt,created_at AS createdAt,updated_at AS updatedAt,sys.fn_varbintohexstr([version]) AS version FROM dbo.public_simplified_applications WHERE id=@id AND submitted_at IS NOT NULL`);
  if(!app.recordset[0]) throw new PublicApplicationError("not_found","application_not_found");
  const entryRequest=tx?new sql.Request(tx):(await getPool()).request();
  const entries=await entryRequest.input("id",sql.UniqueIdentifier,id).query<any>(`SELECT e.id,e.source_row_number AS rowNumber,e.first_name AS firstName,e.last_name AS lastName,e.company,e.nationality_code AS nationalityCode,CONVERT(NVARCHAR(10),e.birth_date,23) AS birthDate,e.phone,e.email,e.license_plate AS licensePlate,g.name AS gateName,e.host_name AS hostName,e.host_phone AS hostPhone,e.host_email AS hostEmail,e.host_department AS hostDepartment,e.purpose,CONVERT(NVARCHAR(10),e.valid_from,23) AS validFrom,CONVERT(NVARCHAR(10),e.valid_until,23) AS validUntil,e.notes,e.status,e.rejection_reason AS rejectionReason,e.decided_at AS decidedAt,e.created_visit_id AS createdVisitId,sys.fn_varbintohexstr(e.[version]) AS version FROM dbo.public_simplified_application_entries e INNER JOIN dbo.gates g ON g.id=e.gate_id WHERE e.application_id=@id ORDER BY e.source_row_number`);
  return {...app.recordset[0],entries:entries.recordset};
}

export async function decideApplicationEntries(user:AuthenticatedUser, applicationId:string, input:{decision:EntryDecision;rejectionReason?:string|null;applicationVersion:string;entryIds?:string[];allPending?:boolean}, context:{ip?:string|null;userAgent?:string|null}) {
  if(input.decision==="rejected"&&!cleanOptional(input.rejectionReason)) throw new Error("rejection_reason_required");
  const pool=await getPool();const tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const nationalityNotifications: NationalityNotification[]=[];
  try{
    const lock=await new sql.Request(tx).input("id",sql.UniqueIdentifier,applicationId).input("version",sql.VarBinary(8),versionBuffer(input.applicationVersion)).query<{id:string}>("SELECT id FROM dbo.public_simplified_applications WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND [version]=@version AND submitted_at IS NOT NULL AND finalized_at IS NULL");
    if(!lock.recordset[0]) throw new PublicApplicationError("conflict","application_changed");
    const all=await new sql.Request(tx).input("id",sql.UniqueIdentifier,applicationId).query<any>("SELECT e.*,g.name AS gate_name FROM dbo.public_simplified_application_entries e WITH(UPDLOCK,HOLDLOCK) INNER JOIN dbo.gates g ON g.id=e.gate_id WHERE e.application_id=@id ORDER BY e.source_row_number");
    const selected=new Set(input.entryIds??[]); const targets=all.recordset.filter((entry:any)=>entry.status==="pending"&&(input.allPending||selected.has(entry.id)));
    if(!targets.length) throw new PublicApplicationError("not_ready","no_pending_entries");
    for(const entry of targets){if(input.decision==="approved"){const notification=await approveEntry(tx,user,entry);if(notification)nationalityNotifications.push(notification);}else await rejectEntry(tx,user,entry,cleanOptional(input.rejectionReason)!);}
    const counts=await recomputeApplicationStatus(tx,applicationId);
    await writeAuditLog({user:user.username,userId:user.id,action:input.allPending?(input.decision==="approved"?"KSKDT_APPLICATION_BULK_APPROVED":"KSKDT_APPLICATION_BULK_REJECTED"):(input.decision==="approved"?"KSKDT_APPLICATION_ENTRY_APPROVED":"KSKDT_APPLICATION_ENTRY_REJECTED"),objectType:"public_simplified_application",objectId:applicationId,ipAddress:context.ip,userAgent:context.userAgent,metadata:{entry_count:targets.length,decision:input.decision,pending_count:counts.pending}},tx);
    await tx.commit();
  }catch(error){await tx.rollback();throw error;}
  for(const notification of nationalityNotifications) void notifyNationalitySubscribers(notification);
  return getKaskdtApplication(applicationId);
}

async function approveEntry(tx:sql.Transaction,user:AuthenticatedUser,entry:any):Promise<NationalityNotification|null>{
  if(entry.created_visit_id)return null;
  const visitor=await new sql.Request(tx).input("first",sql.NVarChar(120),entry.first_name).input("last",sql.NVarChar(120),entry.last_name).input("company",sql.NVarChar(255),entry.company).input("nationality",sql.NChar(2),entry.nationality_code).input("birth",sql.Date,entry.birth_date).input("phone",sql.NVarChar(80),entry.phone).input("email",sql.NVarChar(255),entry.email).query<{id:string}>(`INSERT INTO dbo.visitors(first_name,last_name,company,nationality_code,birth_date,phone_optional,email_optional) OUTPUT inserted.id VALUES(@first,@last,@company,@nationality,@birth,@phone,@email)`);
  const visitorId=visitor.recordset[0]!.id;const badge=await generateUniqueBadgeNumber(tx);
  const visit=await new sql.Request(tx).input("visitor",sql.UniqueIdentifier,visitorId).input("gate",sql.UniqueIdentifier,entry.gate_id).input("host",sql.NVarChar(255),entry.host_name).input("hostPhone",sql.NVarChar(80),entry.host_phone).input("hostEmail",sql.NVarChar(255),entry.host_email).input("department",sql.NVarChar(255),entry.host_department).input("purpose",sql.NVarChar(500),entry.purpose).input("from",sql.DateTime2,dateOnlyStart(entry.valid_from)).input("until",sql.DateTime2,dateOnlyEnd(entry.valid_until)).input("plate",sql.NVarChar(40),entry.license_plate).input("badge",sql.NVarChar(64),badge).input("notes",sql.NVarChar(sql.MAX),entry.notes).input("user",sql.UniqueIdentifier,user.id).query<{id:string}>(`INSERT INTO dbo.visits(visitor_id,gate_id,host_name,host_phone,host_email,host_department,purpose,valid_from,valid_until,license_plate,badge_number,status,created_by,created_via_public_form,notes,source) OUTPUT inserted.id VALUES(@visitor,@gate,@host,@hostPhone,@hostEmail,@department,@purpose,@from,@until,@plate,@badge,N'pre_registered',@user,0,@notes,N'public_simplified_excel')`);
  await new sql.Request(tx).input("entry",sql.UniqueIdentifier,entry.id).input("user",sql.UniqueIdentifier,user.id).input("visit",sql.UniqueIdentifier,visit.recordset[0]!.id).input("visitor",sql.UniqueIdentifier,visitorId).query("UPDATE dbo.public_simplified_application_entries SET status=N'approved',decided_by=@user,decided_at=SYSUTCDATETIME(),created_visit_id=@visit,created_visitor_id=@visitor,updated_at=SYSUTCDATETIME() WHERE id=@entry AND status=N'pending'");
  if(!entry.nationality_code)return null;
  return {visitId:visit.recordset[0]!.id,nationalityCode:entry.nationality_code,visitorName:[cleanOptional(entry.first_name),cleanOptional(entry.last_name)].filter(Boolean).join(" ")||"Keine Angabe",company:cleanOptional(entry.company)??"Keine Angabe",validFrom:new Date(entry.valid_from).toISOString().slice(0,10),validUntil:new Date(entry.valid_until).toISOString().slice(0,10),gateName:entry.gate_name??null};
}
async function rejectEntry(tx:sql.Transaction,user:AuthenticatedUser,entry:any,reason:string){await new sql.Request(tx).input("entry",sql.UniqueIdentifier,entry.id).input("user",sql.UniqueIdentifier,user.id).input("reason",sql.NVarChar(1000),reason).query("UPDATE dbo.public_simplified_application_entries SET status=N'rejected',rejection_reason=@reason,decided_by=@user,decided_at=SYSUTCDATETIME(),updated_at=SYSUTCDATETIME() WHERE id=@entry AND status=N'pending'");}
async function recomputeApplicationStatus(tx:sql.Transaction,id:string){const result=await new sql.Request(tx).input("id",sql.UniqueIdentifier,id).query<{pending:number;approved:number;rejected:number}>("SELECT SUM(CASE WHEN status=N'pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status=N'approved' THEN 1 ELSE 0 END) approved,SUM(CASE WHEN status=N'rejected' THEN 1 ELSE 0 END) rejected FROM dbo.public_simplified_application_entries WHERE application_id=@id");const c=result.recordset[0]??{pending:0,approved:0,rejected:0};const status=c.pending>0?"submitted":c.approved>0&&c.rejected>0?"partially_approved":c.approved>0?"approved":"rejected";await new sql.Request(tx).input("id",sql.UniqueIdentifier,id).input("status",sql.NVarChar(40),status).query("UPDATE dbo.public_simplified_applications SET status=@status,decided_at=CASE WHEN @status=N'submitted' THEN NULL ELSE SYSUTCDATETIME() END,updated_at=SYSUTCDATETIME() WHERE id=@id");return c;}

export async function finalizeApplication(user:AuthenticatedUser,id:string,applicationVersion:string,context:{ip?:string|null;userAgent?:string|null}){
  const pool=await getPool();const tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);let shouldDeliver=false;
  try{
    const app=await new sql.Request(tx).input("id",sql.UniqueIdentifier,id).input("version",sql.VarBinary(8),versionBuffer(applicationVersion)).query<any>("SELECT * FROM dbo.public_simplified_applications WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND [version]=@version AND submitted_at IS NOT NULL");const item=app.recordset[0];if(!item)throw new PublicApplicationError("conflict","application_changed");
    if(!item.finalized_at){
      const entries=await new sql.Request(tx).input("id",sql.UniqueIdentifier,id).query<any>("SELECT first_name AS firstName,last_name AS lastName,status,rejection_reason AS rejectionReason FROM dbo.public_simplified_application_entries WHERE application_id=@id ORDER BY source_row_number");if(entries.recordset.some((entry:any)=>entry.status==="pending"))throw new PublicApplicationError("not_ready","pending_entries");
      await new sql.Request(tx).input("id",sql.UniqueIdentifier,id).query("UPDATE dbo.public_simplified_applications SET finalized_at=SYSUTCDATETIME(),updated_at=SYSUTCDATETIME() WHERE id=@id");await enqueueMail(tx,id,"applicant-decision","decision",[item.applicant_email],{reference:item.public_reference,status:item.status,entries:entries.recordset});
      await writeAuditLog({user:user.username,userId:user.id,action:"KSKDT_APPLICATION_FINALIZED",objectType:"public_simplified_application",objectId:id,ipAddress:context.ip,userAgent:context.userAgent,metadata:{status:item.status,approved:entries.recordset.filter((e:any)=>e.status==="approved").length,rejected:entries.recordset.filter((e:any)=>e.status==="rejected").length}},tx);shouldDeliver=true;
    }
    await tx.commit();
  }catch(error){try{await tx.rollback();}catch{}throw error;}
  if(shouldDeliver)await deliverApplicationMailOutbox(id);
  return getKaskdtApplication(id);
}

export async function deliverApplicationMailOutbox(applicationId:string):Promise<void>{
  const pool=await getPool();const claimToken=crypto.randomUUID();
  const claimTransaction=new sql.Transaction(pool);await claimTransaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);let result:sql.IResult<any>;
  try{
    result=await new sql.Request(claimTransaction).input("applicationId",sql.UniqueIdentifier,applicationId).input("claimToken",sql.UniqueIdentifier,claimToken).query<any>(`
      ;WITH claimable AS (
        SELECT * FROM dbo.public_simplified_application_mail_outbox WITH(UPDLOCK,READPAST,ROWLOCK,READCOMMITTEDLOCK)
        WHERE application_id=@applicationId AND sent_at IS NULL
          AND (claim_token IS NULL OR claim_expires_at<=SYSUTCDATETIME())
      )
      UPDATE claimable
      SET claim_token=@claimToken,claim_expires_at=DATEADD(MINUTE,15,SYSUTCDATETIME()),updated_at=SYSUTCDATETIME()
      OUTPUT inserted.id,inserted.mail_type AS mailType,inserted.recipients_json AS recipientsJson,inserted.payload_json AS payloadJson
      `);
    await claimTransaction.commit();
  }catch(error){try{await claimTransaction.rollback();}catch{}throw error;}
  for(const row of result.recordset){try{const recipients=JSON.parse(row.recipientsJson) as string[];const payload=JSON.parse(row.payloadJson) as any;const mail=buildOutboxMail(row.mailType,payload);const sent=await sendWorkflowMail({to:recipients,...mail});if(!sent)throw new Error("mail_relay_unavailable");const update=await pool.request().input("id",sql.UniqueIdentifier,row.id).input("claimToken",sql.UniqueIdentifier,claimToken).query("UPDATE dbo.public_simplified_application_mail_outbox SET sent_at=SYSUTCDATETIME(),attempts=attempts+1,last_error=NULL,claim_token=NULL,claim_expires_at=NULL,updated_at=SYSUTCDATETIME() WHERE id=@id AND sent_at IS NULL AND claim_token=@claimToken");if(update.rowsAffected[0]&&row.mailType==="decision")await writeAuditLog({user:"system",action:"PUBLIC_XLSX_DECISION_EMAIL_SENT",objectType:"public_simplified_application",objectId:applicationId,metadata:{reference:payload.reference}});}catch(error){await pool.request().input("id",sql.UniqueIdentifier,row.id).input("claimToken",sql.UniqueIdentifier,claimToken).input("error",sql.NVarChar(500),error instanceof Error?error.message:"mail_failed").query("UPDATE dbo.public_simplified_application_mail_outbox SET attempts=attempts+1,last_error=@error,claim_token=NULL,claim_expires_at=NULL,updated_at=SYSUTCDATETIME() WHERE id=@id AND sent_at IS NULL AND claim_token=@claimToken");}}
}
function triggerApplicationMailOutbox(applicationId:string):void{
  void deliverApplicationMailOutbox(applicationId).catch((error)=>writeErrorLog({level:"error",errorCode:"PUBLIC_XLSX_MAIL_OUTBOX_DELIVERY_FAILED",message:"Die E-Mail-Outbox konnte nicht verarbeitet werden.",stackTrace:error instanceof Error?error.stack??null:null,metadataJson:JSON.stringify({applicationId})}).catch(()=>undefined));
}
function buildOutboxMail(type:string,p:any):{subject:string;text:string;html:string}{
  if(type==="kaskdt_new"){const url=`${env.PUBLIC_BASE_URL.replace(/\/+$/,'')}/kaskdt/antraege/${p.applicationId}`;return{subject:"Neuer Antrag zur vereinfachten Besucherregelung",text:`Referenz: ${p.reference}\nAntragsteller: ${p.applicantName||"–"}\nE-Mail: ${p.applicantEmail}\nOrganisation: ${p.organization||"–"}\nPersonen: ${p.count}\nZeitraum: ${p.period}\n${url}`,html:buildMailHtml({heading:"Neuer Antrag zur vereinfachten Besucherregelung",introduction:"Ein Antrag der vereinfachten Besucherregelung steht zur Prüfung bereit.",details:[{label:"Referenz",value:p.reference},{label:"Antragsteller",value:p.applicantName},{label:"E-Mail",value:p.applicantEmail},{label:"Organisation",value:p.organization},{label:"Personen",value:String(p.count)},{label:"Zeitraum",value:p.period}],detailUrl:url,detailLinkLabel:"Antrag prüfen"})};}
  if(type==="decision"){const approved=p.entries.filter((e:any)=>e.status==="approved"),rejected=p.entries.filter((e:any)=>e.status==="rejected");const heading=approved.length&&rejected.length?"Ihr Antrag wurde teilweise genehmigt.":approved.length?"Ihr Antrag wurde genehmigt.":"Ihr Antrag wurde abgelehnt.";const lines=["Entscheidung zu Ihrem Antrag der vereinfachten Besucherregelung",heading,`Referenz: ${p.reference}`,"",...(approved.length?["Genehmigt",...approved.map((e:any)=>`- ${[e.firstName,e.lastName].filter(Boolean).join(" ")||"Keine Angabe"}`),""]:[]),...(rejected.length?["Abgelehnt",...rejected.map((e:any)=>`- ${[e.firstName,e.lastName].filter(Boolean).join(" ")||"Keine Angabe"} – ${e.rejectionReason||"ohne Angabe"}`)]:[])];return{subject:"Entscheidung zu Ihrem Antrag der vereinfachten Besucherregelung",text:lines.join("\n"),html:`<h2>Entscheidung zu Ihrem Antrag der vereinfachten Besucherregelung</h2><p>${escapeMailHtml(heading)}</p><p>Referenz: ${escapeMailHtml(p.reference)}</p>${approved.length?`<h3>Genehmigt</h3><ul>${approved.map((e:any)=>`<li>${escapeMailHtml([e.firstName,e.lastName].filter(Boolean).join(" ")||"Keine Angabe")}</li>`).join("")}</ul>`:""}${rejected.length?`<h3>Abgelehnt</h3><ul>${rejected.map((e:any)=>`<li>${escapeMailHtml([e.firstName,e.lastName].filter(Boolean).join(" ")||"Keine Angabe")} – ${escapeMailHtml(e.rejectionReason||"ohne Angabe")}</li>`).join("")}</ul>`:""}`};}
  return{subject:"Ihr Antrag zur vereinfachten Besucherregelung wurde eingereicht",text:`Ihr Antrag zur vereinfachten Besucherregelung wurde eingereicht.\nReferenz: ${p.reference}\nPersonen: ${p.count}\nZeitraum: ${p.period}\nDer Antrag wird von KSKdt geprüft.`,html:buildMailHtml({heading:"Antrag zur vereinfachten Besucherregelung eingereicht",introduction:"Ihr Antrag wurde eingereicht und wird von KSKdt geprüft.",details:[{label:"Referenz",value:p.reference},{label:"Personen",value:String(p.count)},{label:"Zeitraum",value:p.period}]})};
}
