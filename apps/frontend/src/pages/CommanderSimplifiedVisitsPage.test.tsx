import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, ThemeProvider, type User } from "../app/core";
import { CommanderSimplifiedVisitsPage } from "./CommanderSimplifiedVisitsPage";

const user: User = {
  id: "kaskdt-1", username: "kaskdt", role: "kaskdt", roles: ["kaskdt"], gateId: null, groups: [], menuAccess: ["kaskdt"],
  permissions: {
    menu: { preRegistration: false, guard: false, import: false, admin: false, sibe: false, commander: true, texts: false },
    visits: { read: true, create: false, update: false, delete: false, checkIn: false, checkOut: false, printBadge: false },
    imports: { execute: false }, texts: { manage: false }, dashboards: { sibe: false, commander: true },
    admin: { users: false, guards: false, map: false, fields: false, system: false }, logs: { audit: false, errors: false }
  }
};

function json(payload: unknown) { return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }); }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("KSKdt simplified visits", () => {
  it("describes all statuses and offers rejected visits as a filter", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/me") return json({ user });
      if (path === "/api/ui-settings") return json({ backgroundMode: "plain", backgroundImageUrl: "", securityNumber: "BM2026" });
      if (path === "/api/public/gates") return json({ gates: [] });
      if (path.startsWith("/api/kaskdt/simplified-visits?")) return json({ visits: [], total: 0 });
      throw new Error(`Unexpected request: ${path}`);
    }));
    render(<MemoryRouter><ThemeProvider><AuthProvider><CommanderSimplifiedVisitsPage /></AuthProvider></ThemeProvider></MemoryRouter>);
    expect(await screen.findByText(/einschließlich abgelehnter Einträge/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Abgelehnt" })).toHaveValue("rejected");
  });
});
