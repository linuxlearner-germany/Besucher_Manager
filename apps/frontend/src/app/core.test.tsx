import { describe, expect, it } from "vitest";
import {
  formatDateOnly,
  formatPersonName,
  formatStatus,
  hasPermission,
  type User
} from "./core";

const user: User = {
  id: "user-1",
  username: "wache",
  role: "guard",
  gateId: "gate-1",
  groups: [],
  menuAccess: ["wache"],
  permissions: {
    menu: { preRegistration: false, guard: true, import: false, admin: false, sibe: false, commander: false, texts: false },
    visits: { read: true, create: true, update: false, delete: false, checkIn: true, checkOut: false, printBadge: false },
    imports: { execute: false },
    texts: { manage: false },
    dashboards: { sibe: false, commander: false },
    admin: { users: false, guards: false, map: false, fields: false, system: false },
    logs: { audit: false, errors: false }
  }
};

describe("frontend core helpers", () => {
  it("formats date-only values and known visit statuses", () => {
    expect(formatDateOnly("2026-08-06")).toBe("06.08.2026");
    expect(formatStatus("checked_in")).toBe("Eingecheckt");
  });

  it("formats missing visitor names without leaking undefined", () => {
    expect(formatPersonName("", "")).toBe("Ohne Namensangabe");
    expect(formatPersonName("Erika", "Muster")).toBe("Erika Muster");
  });

  it("uses the explicit permission model", () => {
    expect(hasPermission(user, "visits.checkIn")).toBe(true);
    expect(hasPermission(user, "visits.checkOut")).toBe(false);
  });
});
