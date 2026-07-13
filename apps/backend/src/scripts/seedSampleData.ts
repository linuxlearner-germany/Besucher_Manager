import { closePool, getPool } from "../lib/db";
import { hashPassword } from "../lib/users";
import { VISIT_STATUS } from "../lib/visitWorkflow";

type SeedGate = {
  name: string;
  location: string;
  description: string;
  sortOrder: number;
};

type SeedUser = {
  username: string;
  password: string;
  role: "guard" | "sibe";
  gateName?: string;
  email?: string;
};

type SeedVisitor = {
  firstName: string;
  lastName: string;
  company: string;
  birthDate?: string;
  phone?: string;
  email?: string;
};

type SeedVisit = {
  marker: string;
  visitorKey: string;
  gateName: string;
  hostName: string;
  hostEmail?: string;
  hostPhone?: string;
  hostDepartment: string;
  purpose: string;
  licensePlate?: string;
  status: "pre_registered" | "checked_in" | "checked_out" | "cancelled";
  validFrom: Date;
  validUntil: Date;
  notes: string;
  checkoutNote?: string;
  signedByHostConfirmed?: boolean;
  cancelReason?: string;
};

const sampleGates: SeedGate[] = [
  { name: "Hauptwache", location: "Werk / Eingang", description: "Standard-Wache", sortOrder: 10 },
  { name: "Nordtor", location: "Nordseite", description: "Zusatz-Wache fuer Tests", sortOrder: 20 },
  { name: "Westtor", location: "Westseite", description: "Zusatz-Wache fuer Tests", sortOrder: 30 }
];

const sampleUsers: SeedUser[] = [
  { username: "guard.demo", password: "Test1234!", role: "guard", gateName: "Hauptwache" },
  { username: "guard.nord", password: "Test1234!", role: "guard", gateName: "Nordtor" },
  { username: "sibe.demo", password: "Test1234!", role: "sibe", email: "sibe.demo@wiweb.test" }
];

const sampleVisitors: SeedVisitor[] = [
  { firstName: "Max", lastName: "Beispiel", company: "Acme GmbH", birthDate: "1988-04-12", phone: "0151 111111", email: "max.beispiel@acme.test" },
  { firstName: "Erika", lastName: "Muster", company: "NordTech AG", birthDate: "1992-09-03", phone: "0151 222222", email: "erika.muster@nordtech.test" },
  { firstName: "Sven", lastName: "Pruefer", company: "Werkservice KG", birthDate: "1979-01-28", phone: "0151 333333", email: "sven.pruefer@werkservice.test" },
  { firstName: "Lena", lastName: "Archiv", company: "Consulting Test", birthDate: "1996-11-17", phone: "0151 444444", email: "lena.archiv@consulting.test" },
  { firstName: "Jonas", lastName: "Werner", company: "Supply Nord GmbH", birthDate: "1985-07-19", phone: "0151 555555", email: "jonas.werner@supply-nord.test" },
  { firstName: "Mira", lastName: "Scholz", company: "Ingenieurbuero Scholz", birthDate: "1991-02-08", phone: "0151 666666", email: "mira.scholz@scholz.test" },
  { firstName: "Tobias", lastName: "Kranz", company: "Elektro Kranz", birthDate: "1983-12-01", phone: "0151 777777", email: "tobias.kranz@elektro-kranz.test" },
  { firstName: "Nina", lastName: "Roth", company: "Bauplanung Roth", birthDate: "1994-05-26", phone: "0151 888888", email: "nina.roth@bauplanung-roth.test" }
];

function visitorKey(visitor: SeedVisitor): string {
  return `${visitor.firstName}|${visitor.lastName}|${visitor.company}`;
}

function createSampleVisits(now: Date): SeedVisit[] {
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

  const currentWindowVisits: SeedVisit[] = [
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

  const rollingVisitTemplates = [
    {
      markerPrefix: "SEED_ROLLING_PRE_REGISTERED",
      visitor: sampleVisitors[4],
      gateName: "Hauptwache",
      hostName: "Sabine Keller",
      hostEmail: "sabine.keller@firma.test",
      hostPhone: "0511 1100",
      hostDepartment: "Produktion",
      purpose: "Wartungstermin",
      licensePlate: "HM-SN-510",
      status: "pre_registered" as const,
      durationHours: 2,
      note: "Rollierende Voranmeldung"
    },
    {
      markerPrefix: "SEED_ROLLING_CHECKED_IN",
      visitor: sampleVisitors[5],
      gateName: "Nordtor",
      hostName: "Thomas Brandt",
      hostEmail: "thomas.brandt@firma.test",
      hostPhone: "0511 2200",
      hostDepartment: "IT",
      purpose: "Projektbesprechung",
      licensePlate: "HM-IN-620",
      status: "checked_in" as const,
      durationHours: 3,
      note: "Rollierender Check-in"
    },
    {
      markerPrefix: "SEED_ROLLING_CHECKED_OUT",
      visitor: sampleVisitors[6],
      gateName: "Westtor",
      hostName: "Julia Neumann",
      hostEmail: "julia.neumann@firma.test",
      hostPhone: "0511 3300",
      hostDepartment: "Einkauf",
      purpose: "Abstimmung vor Ort",
      licensePlate: "H-EL-730",
      status: "checked_out" as const,
      durationHours: 4,
      note: "Rollierender Check-out"
    },
    {
      markerPrefix: "SEED_ROLLING_CANCELLED",
      visitor: sampleVisitors[7],
      gateName: "Hauptwache",
      hostName: "Martin Vogel",
      hostEmail: "martin.vogel@firma.test",
      hostPhone: "0511 4400",
      hostDepartment: "Sicherheit",
      purpose: "Abgesagter Besprechungstermin",
      licensePlate: "H-BA-840",
      status: "cancelled" as const,
      durationHours: 2,
      note: "Rollierend storniert"
    }
  ];

  const rollingVisits: SeedVisit[] = [];
  const startOffsetDays = -35;
  const intervalDays = 5;
  const totalIntervals = 13;

  for (let intervalIndex = 0; intervalIndex < totalIntervals; intervalIndex += 1) {
    const dayOffset = startOffsetDays + intervalIndex * intervalDays;

    rollingVisitTemplates.forEach((template, templateIndex) => {
      const start = new Date(base);
      start.setDate(base.getDate() + dayOffset);
      start.setHours(8 + templateIndex * 2, 0, 0, 0);

      const end = new Date(start.getTime() + template.durationHours * 60 * 60 * 1000);

      rollingVisits.push({
        marker: `${template.markerPrefix}_${String(intervalIndex + 1).padStart(2, "0")}`,
        visitorKey: visitorKey(template.visitor),
        gateName: template.gateName,
        hostName: template.hostName,
        hostEmail: template.hostEmail,
        hostPhone: template.hostPhone,
        hostDepartment: template.hostDepartment,
        purpose: template.purpose,
        licensePlate: template.licensePlate,
        status: template.status,
        validFrom: start,
        validUntil: end,
        notes: `${template.note} ${intervalIndex + 1}`,
        signedByHostConfirmed: template.status === "checked_out",
        checkoutNote: template.status === "checked_out" ? "Ausfahrt dokumentiert" : undefined,
        cancelReason: template.status === "cancelled" ? "Termin durch Fachbereich verschoben" : undefined
      });
    });
  }

  return [...currentWindowVisits, ...rollingVisits];
}

async function ensureGates() {
  const pool = await getPool();
  const map = new Map<string, string>();

  for (const gate of sampleGates) {
    const existing = await pool.request()
      .input("name", gate.name)
      .query<{ id: string }>("SELECT id FROM dbo.gates WHERE name = @name");

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
      .query<{ id: string }>(`
        INSERT INTO dbo.gates (name, location, description, is_active, sort_order)
        OUTPUT inserted.id
        VALUES (@name, @location, @description, 1, @sortOrder)
      `);

    map.set(gate.name, inserted.recordset[0].id);
  }

  return map;
}

async function ensureUsers(gateIds: Map<string, string>) {
  const pool = await getPool();

  for (const user of sampleUsers) {
    const passwordHash = await hashPassword(user.password);
    const gateId = user.role === "guard" ? gateIds.get(user.gateName ?? "") ?? null : null;
    const existing = await pool.request()
      .input("username", user.username)
      .query<{ id: string }>("SELECT id FROM dbo.users WHERE username = @username");

    if (existing.recordset[0]?.id) {
      await pool.request()
        .input("id", existing.recordset[0].id)
        .input("passwordHash", passwordHash)
        .input("role", user.role)
        .input("gateId", gateId)
        .input("email", user.role === "guard" ? null : user.email ?? null)
        .query(`
          UPDATE dbo.users
          SET
            password_hash = @passwordHash,
            role = @role,
            gate_id = @gateId,
            user_email = @email,
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
      .input("email", user.role === "guard" ? null : user.email ?? null)
      .query(`
        INSERT INTO dbo.users (username, password_hash, display_name, user_email, role, gate_id, is_active)
        VALUES (@username, @passwordHash, @username, @email, @role, @gateId, 1)
      `);
  }
}

async function ensureVisitors() {
  const pool = await getPool();
  const map = new Map<string, string>();

  for (const visitor of sampleVisitors) {
    const existing = await pool.request()
      .input("firstName", visitor.firstName)
      .input("lastName", visitor.lastName)
      .input("company", visitor.company)
      .query<{ id: string }>(`
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
      .query<{ id: string }>(`
        INSERT INTO dbo.visitors (first_name, last_name, company, birth_date, phone_optional, email_optional)
        OUTPUT inserted.id
        VALUES (@firstName, @lastName, @company, @birthDate, @phone, @email)
      `);

    map.set(visitorKey(visitor), inserted.recordset[0].id);
  }

  return map;
}

async function ensureVisits(gateIds: Map<string, string>, visitorIds: Map<string, string>) {
  const pool = await getPool();
  const visits = createSampleVisits(new Date());

  for (const visit of visits) {
    const gateId = gateIds.get(visit.gateName);
    const visitorId = visitorIds.get(visit.visitorKey);

    if (!gateId || !visitorId) {
      throw new Error(`Missing seed dependency for visit ${visit.marker}`);
    }

    const existing = await pool.request()
      .input("marker", `%${visit.marker}%`)
      .query<{ id: string }>("SELECT id FROM dbo.visits WHERE notes LIKE @marker");

    const checkInAt = visit.status === VISIT_STATUS.CHECKED_IN || visit.status === VISIT_STATUS.CHECKED_OUT
      ? new Date(visit.validFrom.getTime() + 20 * 60 * 1000)
      : null;
    const checkOutAt = visit.status === VISIT_STATUS.CHECKED_OUT
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
    await closePool();
  });
