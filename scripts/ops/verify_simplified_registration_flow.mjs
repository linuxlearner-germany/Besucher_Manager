import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const baseUrl = process.argv[2] || "http://127.0.0.1:3030";

class Client {
  cookie = "";

  async request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (this.cookie) headers.set("Cookie", this.cookie);
    let body = options.body;
    if (body && !(body instanceof FormData) && typeof body !== "string") {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }
    const response = await fetch(`${baseUrl}${path}`, { ...options, headers, body });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";", 1)[0];
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.arrayBuffer();
    return { status: response.status, payload };
  }
}

async function login(client, username, password, gateId) {
  const result = await client.request("/api/auth/login", { method: "POST", body: { username, password, ...(gateId ? { gateId } : {}) } });
  assert.equal(result.status, 200, `Login ${username}`);
  return result.payload;
}

function setRow(sheet, rowNumber, values) {
  const headers = new Map();
  sheet.getRow(1).eachCell((cell, column) => headers.set(cell.text, column));
  for (const [header, value] of Object.entries(values)) sheet.getRow(rowNumber).getCell(headers.get(header)).value = value;
}

const publicClient = new Client();
const bootstrap = await publicClient.request("/api/public/simplified-registration/bootstrap");
assert.equal(bootstrap.status, 200);
const csrfToken = bootstrap.payload.csrfToken;

const template = await publicClient.request("/api/public/simplified-registration/template");
assert.equal(template.status, 200);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(template.payload);
const sheet = workbook.getWorksheet("Vereinfachte Anmeldung");
assert.ok(sheet);
const common = {
  "Firma / Organisation": "E2E Service GmbH",
  "Nationalität": "Deutschland",
  "Kasernenbereich": "Standardbereich",
  "Gültig von (Vorschlag)": "01.08.2026",
  "Gültig bis (Vorschlag)": "31.12.2026"
};
setRow(sheet, 4, { ...common, Vorname: "Anna", Nachname: "Exceltest", Kennzeichen: "E2E-AA 1" });
setRow(sheet, 5, { ...common, Vorname: "Ben", Nachname: "Exceltest", Nationalität: "Österreich" });
const uploadBuffer = await workbook.xlsx.writeBuffer();
const form = new FormData();
form.set("applicantEmail", "e2e-antrag@example.org");
form.set("file", new Blob([uploadBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "vereinfachte-e2e.xlsx");
const imported = await publicClient.request("/api/public/simplified-registration/import", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: form });
assert.equal(imported.status, 201, JSON.stringify(imported.payload));
assert.equal(imported.payload.visitorCount, 2, "Beispielzeilen müssen ignoriert werden");
assert.match(imported.payload.requestNumber, /^VM-\d{4}-\d{6}$/);
assert.ok(imported.payload.token.length >= 16);

const unauthenticated = new Client();
assert.equal((await unauthenticated.request("/api/kaskdt/simplified-registrations")).status, 401);

const admin = new Client();
await login(admin, "admin", "Admin123!");
const createdUser = await admin.request("/api/admin/users", { method: "POST", body: { username: "kaskdt.e2e", displayName: "KasKdt E2E", password: "Test1234!", role: "kaskdt" } });
assert.equal(createdUser.status, 201, JSON.stringify(createdUser.payload));
assert.equal((await admin.request("/api/kaskdt/simplified-registrations")).status, 403, "Admin darf nicht genehmigen");

const sibe = new Client();
await login(sibe, "sibe.demo", "Test1234!");
assert.equal((await sibe.request("/api/kaskdt/simplified-registrations")).status, 403, "SiBe darf nicht genehmigen");

const commander = new Client();
await login(commander, "kaskdt.e2e", "Test1234!");
const list = await commander.request("/api/kaskdt/simplified-registrations");
assert.equal(list.status, 200);
const request = list.payload.requests.find((item) => item.requestNumber === imported.payload.requestNumber);
assert.ok(request);
const detail = await commander.request(`/api/kaskdt/simplified-registrations/${request.id}`);
assert.equal(detail.status, 200);
assert.equal(detail.payload.entries.length, 2);
const [approvedEntry, rejectedEntry] = detail.payload.entries;
const approved = await commander.request(`/api/kaskdt/simplified-registrations/${request.id}/entries/${approvedEntry.id}/approve`, { method: "POST", body: { version: approvedEntry.version, finalValidFrom: "2026-08-01", finalValidUntil: "2026-12-31" } });
assert.equal(approved.status, 200, JSON.stringify(approved.payload));
const rejected = await commander.request(`/api/kaskdt/simplified-registrations/${request.id}/entries/${rejectedEntry.id}/reject`, { method: "POST", body: { version: rejectedEntry.version, rejectionReason: "E2E-Ablehnungsgrund" } });
assert.equal(rejected.status, 200, JSON.stringify(rejected.payload));
assert.equal(rejected.payload.requestStatus, "completed");

const publicStatus = await publicClient.request("/api/public/simplified-registration/status", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: { requestNumber: imported.payload.requestNumber, token: imported.payload.token } });
assert.equal(publicStatus.status, 200);
assert.deepEqual(publicStatus.payload.entries.map((entry) => entry.status).sort(), ["approved", "rejected"]);
assert.equal(publicStatus.payload.entries.find((entry) => entry.status === "rejected").rejectionReason, "E2E-Ablehnungsgrund");
assert.equal(Object.hasOwn(publicStatus.payload.entries[0], "idDocumentNumber"), false, "Ausweisdaten dürfen nicht öffentlich sein");
const wrongToken = await publicClient.request("/api/public/simplified-registration/status", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: { requestNumber: imported.payload.requestNumber, token: "ungueltiger-sicherheitstoken" } });
assert.equal(wrongToken.status, 404);

const guard = new Client();
const firstLogin = await login(guard, "guard.demo", "Test1234!");
const gateId = firstLogin.requiresGateSelection ? firstLogin.gates[0].id : firstLogin.user.gateId;
if (firstLogin.requiresGateSelection) await login(guard, "guard.demo", "Test1234!", gateId);
const guardList = await guard.request("/api/guard/simplified-visitors?validity=current&search=Exceltest");
assert.equal(guardList.status, 200);
assert.equal(guardList.payload.entries.length, 1);
const visitorSearch = await guard.request("/api/guard/visitors/search?firstName=Anna&lastName=Exceltest");
assert.equal(visitorSearch.status, 200);
assert.ok(visitorSearch.payload.visitors.some((visitor) => visitor.simplifiedRegistrations?.length > 0), "Spontanbesuchersuche muss die Freigabe anzeigen");

console.log(JSON.stringify({ success: true, requestNumber: imported.payload.requestNumber, visitorCount: 2, aggregateStatus: "completed", guardMatches: guardList.payload.entries.length }, null, 2));
