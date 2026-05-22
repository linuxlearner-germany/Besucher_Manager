"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../lib/db");
const users_1 = require("../lib/users");
const visitWorkflow_1 = require("../lib/visitWorkflow");
const sampleGates = [
    { name: "Hauptwache", location: "Werk / Eingang", description: "Standard-Wache", sortOrder: 10 },
    { name: "Nordtor", location: "Nordseite", description: "Zusatz-Wache fuer Tests", sortOrder: 20 },
    { name: "Westtor", location: "Westseite", description: "Zusatz-Wache fuer Tests", sortOrder: 30 }
];
const sampleUsers = [
    { username: "guard.demo", password: "Test1234!", role: "guard", gateName: "Hauptwache" },
    { username: "guard.nord", password: "Test1234!", role: "guard", gateName: "Nordtor" },
    { username: "sibe.demo", password: "Test1234!", role: "sibe" }
];
const sampleVisitors = [
    { firstName: "Max", lastName: "Beispiel", company: "Acme GmbH", birthDate: "1988-04-12", phone: "0151 111111", email: "max.beispiel@acme.test" },
    { firstName: "Erika", lastName: "Muster", company: "NordTech AG", birthDate: "1992-09-03", phone: "0151 222222", email: "erika.muster@nordtech.test" },
    { firstName: "Sven", lastName: "Pruefer", company: "Werkservice KG", birthDate: "1979-01-28", phone: "0151 333333", email: "sven.pruefer@werkservice.test" },
    { firstName: "Lena", lastName: "Archiv", company: "Consulting Test", birthDate: "1996-11-17", phone: "0151 444444", email: "lena.archiv@consulting.test" }
];
function visitorKey(visitor) {
    return `${visitor.firstName}|${visitor.lastName}|${visitor.company}`;
}
function createSampleVisits(now) {
    const base = new Date(now);
    base.setMinutes(0, 0, 0);
    const visit1Start = new Date(base);
    visit1Start.setHours(base.getHours() + 1);
    const visit1End = new Date(visit1Start.getTime() + 2 * 60 * 60 * 1000);
    const visit2Start = new Date(base);
    visit2Start.setHours(base.getHours() - 1);
    const visit2End = new Date(visit2Start.getTime() + 3 * 60 * 60 * 1000);
    const visit3Start = new Date(base);
    visit3Start.setHours(base.getHours() - 4);
    const visit3End = new Date(visit3Start.getTime() + 2 * 60 * 60 * 1000);
    const visit4Start = new Date(base);
    visit4Start.setDate(visit4Start.getDate() - 1);
    visit4Start.setHours(9, 0, 0, 0);
    const visit4End = new Date(visit4Start.getTime() + 2 * 60 * 60 * 1000);
    return [
        {
            marker: "SEED_VISIT_PRE_REGISTERED",
            visitorKey: visitorKey(sampleVisitors[0]),
            gateName: "Hauptwache",
            hostName: "Sabine Keller",
            hostEmail: "sabine.keller@firma.test",
            hostPhone: "0511 1000",
            hostDepartment: "Produktion",
            purpose: "Lieferantenbesuch",
            licensePlate: "HM-AC-101",
            status: "pre_registered",
            validFrom: visit1Start,
            validUntil: visit1End,
            notes: "Seed-Datensatz Voranmeldung"
        },
        {
            marker: "SEED_VISIT_CHECKED_IN",
            visitorKey: visitorKey(sampleVisitors[1]),
            gateName: "Nordtor",
            hostName: "Thomas Brandt",
            hostEmail: "thomas.brandt@firma.test",
            hostPhone: "0511 2000",
            hostDepartment: "IT",
            purpose: "Projekttermin",
            licensePlate: "HM-NT-202",
            status: "checked_in",
            validFrom: visit2Start,
            validUntil: visit2End,
            notes: "Seed-Datensatz Eingecheckt",
            signedByHostConfirmed: false
        },
        {
            marker: "SEED_VISIT_CHECKED_OUT",
            visitorKey: visitorKey(sampleVisitors[2]),
            gateName: "Westtor",
            hostName: "Julia Neumann",
            hostEmail: "julia.neumann@firma.test",
            hostPhone: "0511 3000",
            hostDepartment: "Einkauf",
            purpose: "Abstimmung",
            licensePlate: "H-WS-303",
            status: "checked_out",
            validFrom: visit3Start,
            validUntil: visit3End,
            notes: "Seed-Datensatz Ausgecheckt",
            signedByHostConfirmed: true,
            checkoutNote: "Ausfahrt freigegeben"
        },
        {
            marker: "SEED_VISIT_CANCELLED",
            visitorKey: visitorKey(sampleVisitors[3]),
            gateName: "Hauptwache",
            hostName: "Martin Vogel",
            hostEmail: "martin.vogel@firma.test",
            hostPhone: "0511 4000",
            hostDepartment: "Sicherheit",
            purpose: "Abgesagter Termin",
            licensePlate: "H-CA-404",
            status: "cancelled",
            validFrom: visit4Start,
            validUntil: visit4End,
            notes: "Seed-Datensatz Storniert",
            cancelReason: "Termin abgesagt"
        }
    ];
}
async function ensureGates() {
    const pool = await (0, db_1.getPool)();
    const map = new Map();
    for (const gate of sampleGates) {
        const existing = await pool.request()
            .input("name", gate.name)
            .query("SELECT id FROM dbo.gates WHERE name = @name");
        if (existing.recordset[0]?.id) {
            await pool.request()
                .input("id", existing.recordset[0].id)
                .input("location", gate.location)
                .input("description", gate.description)
                .input("sortOrder", gate.sortOrder)
                .query(`
          UPDATE dbo.gates
          SET
            location = @location,
            description = @description,
            sort_order = @sortOrder,
            is_active = 1,
            updated_at = SYSUTCDATETIME()
          WHERE id = @id
        `);
            map.set(gate.name, existing.recordset[0].id);
            continue;
        }
        const inserted = await pool.request()
            .input("name", gate.name)
            .input("location", gate.location)
            .input("description", gate.description)
            .input("sortOrder", gate.sortOrder)
            .query(`
        INSERT INTO dbo.gates (name, location, description, is_active, sort_order)
        OUTPUT inserted.id
        VALUES (@name, @location, @description, 1, @sortOrder)
      `);
        map.set(gate.name, inserted.recordset[0].id);
    }
    return map;
}
async function ensureUsers(gateIds) {
    const pool = await (0, db_1.getPool)();
    for (const user of sampleUsers) {
        const passwordHash = await (0, users_1.hashPassword)(user.password);
        const gateId = user.role === "guard" ? gateIds.get(user.gateName ?? "") ?? null : null;
        const existing = await pool.request()
            .input("username", user.username)
            .query("SELECT id FROM dbo.users WHERE username = @username");
        if (existing.recordset[0]?.id) {
            await pool.request()
                .input("id", existing.recordset[0].id)
                .input("passwordHash", passwordHash)
                .input("role", user.role)
                .input("gateId", gateId)
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
            continue;
        }
        await pool.request()
            .input("username", user.username)
            .input("passwordHash", passwordHash)
            .input("role", user.role)
            .input("gateId", gateId)
            .query(`
        INSERT INTO dbo.users (username, password_hash, display_name, role, gate_id, is_active)
        VALUES (@username, @passwordHash, @username, @role, @gateId, 1)
      `);
    }
}
async function ensureVisitors() {
    const pool = await (0, db_1.getPool)();
    const map = new Map();
    for (const visitor of sampleVisitors) {
        const existing = await pool.request()
            .input("firstName", visitor.firstName)
            .input("lastName", visitor.lastName)
            .input("company", visitor.company)
            .query(`
        SELECT id
        FROM dbo.visitors
        WHERE first_name = @firstName AND last_name = @lastName AND company = @company
      `);
        if (existing.recordset[0]?.id) {
            await pool.request()
                .input("id", existing.recordset[0].id)
                .input("birthDate", visitor.birthDate ?? null)
                .input("phone", visitor.phone ?? null)
                .input("email", visitor.email ?? null)
                .query(`
          UPDATE dbo.visitors
          SET
            birth_date = @birthDate,
            phone_optional = @phone,
            email_optional = @email,
            is_active = 1,
            updated_at = SYSUTCDATETIME()
          WHERE id = @id
        `);
            map.set(visitorKey(visitor), existing.recordset[0].id);
            continue;
        }
        const inserted = await pool.request()
            .input("firstName", visitor.firstName)
            .input("lastName", visitor.lastName)
            .input("company", visitor.company)
            .input("birthDate", visitor.birthDate ?? null)
            .input("phone", visitor.phone ?? null)
            .input("email", visitor.email ?? null)
            .query(`
        INSERT INTO dbo.visitors (first_name, last_name, company, birth_date, phone_optional, email_optional)
        OUTPUT inserted.id
        VALUES (@firstName, @lastName, @company, @birthDate, @phone, @email)
      `);
        map.set(visitorKey(visitor), inserted.recordset[0].id);
    }
    return map;
}
async function ensureVisits(gateIds, visitorIds) {
    const pool = await (0, db_1.getPool)();
    const visits = createSampleVisits(new Date());
    for (const visit of visits) {
        const gateId = gateIds.get(visit.gateName);
        const visitorId = visitorIds.get(visit.visitorKey);
        if (!gateId || !visitorId) {
            throw new Error(`Missing seed dependency for visit ${visit.marker}`);
        }
        const existing = await pool.request()
            .input("marker", `%${visit.marker}%`)
            .query("SELECT id FROM dbo.visits WHERE notes LIKE @marker");
        const checkInAt = visit.status === visitWorkflow_1.VISIT_STATUS.CHECKED_IN || visit.status === visitWorkflow_1.VISIT_STATUS.CHECKED_OUT
            ? new Date(visit.validFrom.getTime() + 20 * 60 * 1000)
            : null;
        const checkOutAt = visit.status === visitWorkflow_1.VISIT_STATUS.CHECKED_OUT
            ? new Date(visit.validUntil.getTime() - 15 * 60 * 1000)
            : null;
        if (existing.recordset[0]?.id) {
            await pool.request()
                .input("id", existing.recordset[0].id)
                .input("visitorId", visitorId)
                .input("gateId", gateId)
                .input("hostName", visit.hostName)
                .input("hostEmail", visit.hostEmail ?? null)
                .input("hostPhone", visit.hostPhone ?? null)
                .input("hostDepartment", visit.hostDepartment)
                .input("purpose", visit.purpose)
                .input("validFrom", visit.validFrom)
                .input("validUntil", visit.validUntil)
                .input("licensePlate", visit.licensePlate ?? null)
                .input("status", visit.status)
                .input("notes", `${visit.marker} | ${visit.notes}`)
                .input("checkInAt", checkInAt)
                .input("checkOutAt", checkOutAt)
                .input("checkoutNote", visit.checkoutNote ?? null)
                .input("signedByHostConfirmed", visit.signedByHostConfirmed ? 1 : 0)
                .input("cancelReason", visit.cancelReason ?? null)
                .query(`
          UPDATE dbo.visits
          SET
            visitor_id = @visitorId,
            gate_id = @gateId,
            host_name = @hostName,
            host_email = @hostEmail,
            host_phone = @hostPhone,
            host_department = @hostDepartment,
            purpose = @purpose,
            valid_from = @validFrom,
            valid_until = @validUntil,
            license_plate = @licensePlate,
            status = @status,
            notes = @notes,
            check_in_at = @checkInAt,
            check_out_at = @checkOutAt,
            checkout_note = @checkoutNote,
            signed_by_host_confirmed = @signedByHostConfirmed,
            cancel_reason = @cancelReason,
            cancelled_at = CASE WHEN @status = 'cancelled' THEN SYSUTCDATETIME() ELSE NULL END,
            updated_at = SYSUTCDATETIME()
          WHERE id = @id
        `);
            continue;
        }
        await pool.request()
            .input("visitorId", visitorId)
            .input("gateId", gateId)
            .input("hostName", visit.hostName)
            .input("hostEmail", visit.hostEmail ?? null)
            .input("hostPhone", visit.hostPhone ?? null)
            .input("hostDepartment", visit.hostDepartment)
            .input("purpose", visit.purpose)
            .input("validFrom", visit.validFrom)
            .input("validUntil", visit.validUntil)
            .input("licensePlate", visit.licensePlate ?? null)
            .input("status", visit.status)
            .input("notes", `${visit.marker} | ${visit.notes}`)
            .input("checkInAt", checkInAt)
            .input("checkOutAt", checkOutAt)
            .input("checkoutNote", visit.checkoutNote ?? null)
            .input("signedByHostConfirmed", visit.signedByHostConfirmed ? 1 : 0)
            .input("cancelReason", visit.cancelReason ?? null)
            .query(`
        INSERT INTO dbo.visits (
          visitor_id,
          gate_id,
          host_name,
          host_email,
          host_phone,
          host_department,
          purpose,
          valid_from,
          valid_until,
          license_plate,
          status,
          created_via_public_form,
          notes,
          check_in_at,
          check_out_at,
          checkout_note,
          signed_by_host_confirmed,
          cancel_reason,
          cancelled_at
        )
        VALUES (
          @visitorId,
          @gateId,
          @hostName,
          @hostEmail,
          @hostPhone,
          @hostDepartment,
          @purpose,
          @validFrom,
          @validUntil,
          @licensePlate,
          @status,
          0,
          @notes,
          @checkInAt,
          @checkOutAt,
          @checkoutNote,
          @signedByHostConfirmed,
          @cancelReason,
          CASE WHEN @status = 'cancelled' THEN SYSUTCDATETIME() ELSE NULL END
        )
      `);
    }
}
async function main() {
    console.log("Seeding sample data...");
    const gateIds = await ensureGates();
    await ensureUsers(gateIds);
    const visitorIds = await ensureVisitors();
    await ensureVisits(gateIds, visitorIds);
    console.log("Sample data ready.");
    console.log("Created/updated test users:");
    for (const user of sampleUsers) {
        console.log(`- ${user.username} / ${user.password} (${user.role})`);
    }
}
main()
    .catch((error) => {
    console.error("Seed sample data failed.", error);
    process.exitCode = 1;
})
    .finally(async () => {
    await (0, db_1.closePool)();
});
