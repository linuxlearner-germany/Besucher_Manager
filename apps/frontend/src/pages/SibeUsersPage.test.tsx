import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, ThemeProvider, type User } from "../app/core";
import { SibeUsersPage } from "./SibeUsersPage";

const sibeUser: User = {
  id: "sibe-1", username: "sibe.test", role: "sibe", roles: ["sibe"], gateId: null, groups: [], menuAccess: ["sibe"],
  permissions: {
    menu: { preRegistration: false, guard: false, import: false, admin: false, sibe: true, commander: false, texts: false },
    visits: { read: true, create: false, update: false, delete: false, checkIn: false, checkOut: false, printBadge: false },
    imports: { execute: false }, texts: { manage: false }, dashboards: { sibe: true, commander: false },
    admin: { users: false, guards: false, map: false, fields: false, system: false }, logs: { audit: false, errors: false }
  }
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("user list filters", () => {
  it("gives every filter a visible accessible name", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      const payload = path === "/api/auth/me"
        ? { user: sibeUser }
        : path === "/api/ui-settings"
          ? { backgroundMode: "plain", backgroundImageUrl: "", securityNumber: "BM2026" }
          : path.startsWith("/api/sibe/users?")
            ? { users: [] }
            : null;
      if (payload === null) throw new Error(`Unexpected request: ${path}`);
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    render(<MemoryRouter><ThemeProvider><AuthProvider><SibeUsersPage /></AuthProvider></ThemeProvider></MemoryRouter>);

    expect(await screen.findByRole("textbox", { name: "Benutzername suchen" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Rolle" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Wache" })).toBeInTheDocument();
    expect(screen.getByLabelText("Letzter Login von")).toBeInTheDocument();
    expect(screen.getByLabelText("Letzter Login bis")).toBeInTheDocument();
  });
});
