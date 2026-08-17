import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, ThemeProvider, type User } from "../app/core";
import { CommanderDashboardPage } from "./CommanderDashboardPage";

function makeUser(role: "admin" | "kaskdt"): User {
  return {
    id: `${role}-1`,
    username: `${role}.test`,
    role,
    roles: [role],
    gateId: null,
    groups: [],
    menuAccess: ["kaskdt", "texte"],
    permissions: {
      menu: { preRegistration: false, guard: false, import: false, admin: role === "admin", sibe: false, commander: true, texts: true },
      visits: { read: true, create: false, update: false, delete: false, checkIn: false, checkOut: false, printBadge: false },
      imports: { execute: false },
      texts: { manage: true },
      dashboards: { sibe: false, commander: true },
      admin: { users: role === "admin", guards: false, map: false, fields: false, system: false },
      logs: { audit: false, errors: false }
    }
  };
}

function mockApi(user: User) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    let payload: unknown;
    if (path === "/api/auth/me") payload = { user };
    else if (path === "/api/ui-settings") payload = { backgroundMode: "plain", backgroundImageUrl: "", securityNumber: "BM2026" };
    else if (path === "/api/sibe/summary") payload = { visitorsTotal: 0, todaysVisits: 0, checkedInVisitors: 0, usersTotal: 0, activeUsers: 0, signaturesPending: 0, signaturesFollowUp: 0, signaturesExceptions: 0 };
    else if (path === "/api/sibe/visits?status=all") payload = { visits: [] };
    else throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}

function renderDashboard(user: User) {
  mockApi(user);
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthProvider>
          <CommanderDashboardPage />
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("KSKdt application navigation", () => {
  it("does not offer the KSKdt application workflow to an admin without that role", async () => {
    renderDashboard(makeUser("admin"));
    expect(await screen.findByRole("heading", { name: "KSKdt-Übersicht" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Anträge öffnen" })).not.toBeInTheDocument();
  });

  it("keeps the application link available to the KSKdt role", async () => {
    renderDashboard(makeUser("kaskdt"));
    expect(await screen.findByRole("link", { name: "Anträge öffnen" })).toHaveAttribute("href", "/kaskdt/antraege");
  });
});
