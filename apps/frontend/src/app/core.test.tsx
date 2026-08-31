import { describe, expect, it } from "vitest";
import {
  formatDateOnly,
  formatPersonName,
  formatStatus,
  buildGuardVisitEditState,
  getDefaultRouteForUser,
  getRootRedirectForUser,
  hasPermission,
  hasRole,
  type User,
  type VisitDetail
} from "./core";

const user: User = {
  id: "user-1",
  username: "wache",
  role: "guard",
  roles: ["guard"],
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

  it("normalizes nullable database values before a guard update is submitted", () => {
    const form = buildGuardVisitEditState({
      firstName: null,
      lastName: null,
      company: null,
      hostName: null,
      hostDepartment: null,
      purpose: null,
      validFrom: "2026-08-31T00:00:00.000Z",
      validUntil: "2026-08-31T23:59:59.999Z"
    } as unknown as VisitDetail);
    expect(form.firstName).toBe("");
    expect(form.lastName).toBe("");
    expect(form.company).toBe("");
    expect(form.hostName).toBe("");
    expect(form.hostDepartment).toBe("");
    expect(form.purpose).toBe("");
  });

  it("uses the explicit permission model", () => {
    expect(hasPermission(user, "visits.checkIn")).toBe(true);
    expect(hasPermission(user, "visits.checkOut")).toBe(false);
  });

  it("recognizes both roles of the supported dual-role account", () => {
    const dual = { ...user, role: "sibe" as const, roles: ["sibe", "kaskdt"] as const };
    expect(hasRole(dual as User, "sibe")).toBe(true);
    expect(hasRole(dual as User, "kaskdt")).toBe(true);
    expect(hasRole(dual as User, "admin")).toBe(false);
  });

  it("uses the guard view as the default and root target for a guard session", () => {
    expect(getDefaultRouteForUser(user)).toBe("/wache");
    expect(getRootRedirectForUser(user)).toBe("/wache");
  });

  it("preserves the existing start-route priority for all other roles", () => {
    const admin = {
      ...user,
      role: "admin" as const,
      roles: ["admin"] as const,
      menuAccess: ["admin", "wache"] as User["menuAccess"],
      permissions: {
        ...user.permissions,
        admin: { ...user.permissions.admin, users: true }
      }
    } as User;
    const sibe = {
      ...user,
      role: "sibe" as const,
      roles: ["sibe"] as const,
      menuAccess: ["sibe"] as User["menuAccess"],
      permissions: {
        ...user.permissions,
        dashboards: { ...user.permissions.dashboards, sibe: true }
      }
    } as User;
    const kaskdt = {
      ...user,
      role: "kaskdt" as const,
      roles: ["kaskdt"] as const,
      menuAccess: ["kaskdt"] as User["menuAccess"],
      permissions: {
        ...user.permissions,
        dashboards: { ...user.permissions.dashboards, commander: true }
      }
    } as User;
    const dual = {
      ...sibe,
      roles: ["sibe", "kaskdt"] as User["roles"],
      menuAccess: ["sibe", "kaskdt"] as User["menuAccess"],
      permissions: {
        ...sibe.permissions,
        dashboards: { sibe: true, commander: true }
      }
    };

    expect(getDefaultRouteForUser(admin)).toBe("/admin");
    expect(getDefaultRouteForUser(sibe)).toBe("/sibe");
    expect(getDefaultRouteForUser(kaskdt)).toBe("/kaskdt");
    expect(getDefaultRouteForUser(dual)).toBe("/sibe");
    expect(getRootRedirectForUser(admin)).toBeNull();
    expect(getRootRedirectForUser(sibe)).toBeNull();
    expect(getRootRedirectForUser(kaskdt)).toBeNull();
    expect(getRootRedirectForUser(dual)).toBeNull();
  });
});
