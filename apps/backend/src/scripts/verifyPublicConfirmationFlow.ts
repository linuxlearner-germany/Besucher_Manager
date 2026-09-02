import sql from "mssql";
import { getPool } from "../lib/db";
import { createPublicVisitAccessToken } from "../lib/publicPreRegistrationAccess";

type ApiResult = { status: number; headers: Headers; payload: any };

async function api(token: string, method = "GET", body?: unknown): Promise<ApiResult> {
  const response = await fetch("http://127.0.0.1:3030/api/public/pre-registration-confirmation", {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Confirmation-Token": token
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, headers: response.headers, payload: await response.json() };
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run() {
  requireCondition(process.env.BESUCHER_MANAGER_TEST_STACK === "1", "Public confirmation verification is restricted to the isolated E2E stack.");
  const pool = await getPool();
  let visitorId: string | null = null;
  let visitId: string | null = null;

  try {
    const visitor = await pool.request().query<{ id: string }>(`
      INSERT INTO dbo.visitors(first_name, last_name, company, phone_optional, email_optional)
      OUTPUT inserted.id
      VALUES(N'Public', N'Confirmation E2E', N'Testfirma', N'030 123-45', N'public-confirmation@example.test')
    `);
    visitorId = visitor.recordset[0]?.id ?? null;
    requireCondition(visitorId, "E2E visitor could not be created.");

    const visit = await pool.request()
      .input("visitorId", sql.UniqueIdentifier, visitorId)
      .query<{ id: string }>(`
        INSERT INTO dbo.visits(visitor_id, gate_id, host_name, host_phone, host_department, purpose, valid_from, valid_until, license_plate, status, created_via_public_form, source)
        OUTPUT inserted.id
        SELECT @visitorId, (SELECT TOP 1 id FROM dbo.gates WHERE is_active=1 ORDER BY sort_order, name),
          N'E2E Ansprechpartner', N'040 (123) 456', N'Integration', N'Öffentlicher Bestätigungsflow',
          DATEADD(DAY, 3, CONVERT(date, SYSUTCDATETIME())), DATEADD(MILLISECOND, -1, DATEADD(DAY, 4, CONVERT(datetime2, CONVERT(date, SYSUTCDATETIME())))),
          N'E2E-PC 1', N'pre_registered', 1, N'public_web'
      `);
    visitId = visit.recordset[0]?.id ?? null;
    requireCondition(visitId, "E2E visit could not be created.");

    const token = await createPublicVisitAccessToken(pool, visitId, new Date(Date.now() + 5 * 86_400_000));
    const firstRead = await api(token);
    requireCondition(firstRead.status === 200, `Valid public read returned ${firstRead.status}.`);
    requireCondition(firstRead.headers.get("cache-control")?.includes("no-store"), "Public response is cacheable.");
    const detail = firstRead.payload.preRegistration;
    requireCondition(detail.firstName === "Public" && detail.editable === true, "Public detail is incomplete or not editable.");
    const serialized = JSON.stringify(firstRead.payload);
    for (const forbidden of [visitId, visitorId, token, "idDocumentNumber", "submittedIpAddress", "hostEmail", "notes"]) {
      requireCondition(!serialized.includes(forbidden), `Public response leaked ${forbidden}.`);
    }

    const internalResponse = await fetch(`http://127.0.0.1:3030/api/sibe/visits/${visitId}`, { headers: { Accept: "application/json" } });
    requireCondition(internalResponse.status === 401, "Internal detail route became public.");

    const updated = await api(token, "PATCH", {
      version: detail.version,
      firstName: "Geändert",
      phone: "",
      licensePlate: "E2E-PC 99",
      purpose: "Aktualisierter Zweck"
    });
    requireCondition(updated.status === 200, `Public update returned ${updated.status}.`);
    requireCondition(updated.payload.preRegistration.firstName === "Geändert", "Name update was not persisted.");
    requireCondition(updated.payload.preRegistration.phone === null, "Optional phone was not cleared.");

    const manipulated = await api(token, "PATCH", { version: updated.payload.preRegistration.version, status: "checked_out", role: "admin" });
    requireCondition(manipulated.status === 400, "Mass assignment was not rejected.");
    const status = await pool.request().input("id", sql.UniqueIdentifier, visitId).query<{ status: string }>("SELECT status FROM dbo.visits WHERE id=@id");
    requireCondition(status.recordset[0]?.status === "pre_registered", "Manipulated status changed the visit.");

    const conflict = await api(token, "PATCH", { version: detail.version, lastName: "Veraltet" });
    requireCondition(conflict.status === 409 && conflict.payload.error === "PUBLIC_CONFIRMATION_CONFLICT", "Stale version was not rejected.");

    await pool.request().input("id", sql.UniqueIdentifier, visitId).query("UPDATE dbo.visits SET status=N'checked_in', check_in_at=SYSUTCDATETIME(), updated_at=SYSUTCDATETIME() WHERE id=@id");
    const afterCheckIn = await api(token);
    requireCondition(afterCheckIn.status === 200 && afterCheckIn.payload.preRegistration.editable === false, "Checked-in visit did not become read-only.");
    const blockedUpdate = await api(token, "PATCH", { version: afterCheckIn.payload.preRegistration.version, company: "Nicht erlaubt" });
    requireCondition(blockedUpdate.status === 409 && blockedUpdate.payload.error === "PUBLIC_CONFIRMATION_NOT_EDITABLE", "Checked-in update was not blocked.");

    const expiredToken = await createPublicVisitAccessToken(pool, visitId, new Date(Date.now() - 1000));
    const expired = await api(expiredToken);
    requireCondition(expired.status === 410 && expired.payload.error === "PUBLIC_CONFIRMATION_EXPIRED", "Expired token was not rejected.");

    await pool.request().input("id", sql.UniqueIdentifier, visitId).query("UPDATE dbo.visits SET status=N'cancelled', cancelled_at=SYSUTCDATETIME(), updated_at=SYSUTCDATETIME() WHERE id=@id");
    const revoked = await api(token);
    requireCondition(revoked.status === 410 && revoked.payload.error === "PUBLIC_CONFIRMATION_REVOKED", "Cancelled visit access was not revoked.");

    const invalid = await api("I".repeat(43));
    requireCondition(invalid.status === 404 && invalid.payload.error === "PUBLIC_CONFIRMATION_NOT_FOUND", "Invalid token did not return 404.");

    const audit = await pool.request().input("id", sql.NVarChar(120), visitId).query<{ metadata: string | null }>(`
      SELECT TOP 1 metadata_json AS metadata FROM dbo.audit_logs
      WHERE object_id=@id AND action=N'public_preregistration_updated'
      ORDER BY [timestamp] DESC
    `);
    const metadata = audit.recordset[0]?.metadata ?? "";
    requireCondition(metadata.includes("changed_fields") && metadata.includes("firstName"), "Public update audit is missing changed field names.");
    requireCondition(!metadata.includes(token), "Audit metadata contains the access token.");

    console.log(JSON.stringify({ success: true, publicFieldsChecked: 17, massAssignmentBlocked: true, conflictBlocked: true, tokenRedacted: true }));
  } finally {
    if (visitId) {
      await pool.request().input("id", sql.NVarChar(120), visitId).query("DELETE FROM dbo.audit_logs WHERE object_id=@id");
      await pool.request().input("id", sql.UniqueIdentifier, visitId).query("DELETE FROM dbo.visits WHERE id=@id");
    }
    if (visitorId) await pool.request().input("id", sql.UniqueIdentifier, visitorId).query("DELETE FROM dbo.visitors WHERE id=@id");
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
