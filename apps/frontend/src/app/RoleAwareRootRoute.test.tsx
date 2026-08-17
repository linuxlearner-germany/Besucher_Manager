import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, RequireRoles, RoleAwareRootRoute, ThemeProvider, type User } from "./core";
import { LoginPage } from "../pages/LoginPage";

const guardUser: User = {
  id: "guard-1",
  username: "wache.test",
  role: "guard",
  roles: ["guard"],
  gateId: "gate-1",
  gateName: "Hauptwache",
  groups: [],
  menuAccess: ["wache"],
  permissions: {
    menu: { preRegistration: false, guard: true, import: false, admin: false, sibe: false, commander: false, texts: false },
    visits: { read: true, create: true, update: true, delete: false, checkIn: true, checkOut: true, printBadge: true },
    imports: { execute: false },
    texts: { manage: false },
    dashboards: { sibe: false, commander: false },
    admin: { users: false, guards: false, map: false, fields: false, system: false },
    logs: { audit: false, errors: false }
  }
};

function renderRoutes(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
          <Route
            path="/"
            element={<RoleAwareRootRoute><div>Allgemeine Startseite</div></RoleAwareRootRoute>}
          />
          <Route
            path="/wache"
            element={
              <RequireRoles allowedRoles={["admin", "guard"]} requiredMenuKey="wache" requiredPermissions={["visits.read"]}>
                <div>Wache-Ansicht</div>
              </RequireRoles>
            }
          />
          <Route path="/login" element={<div>Login</div>} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("role-aware root routing", () => {
  it("navigates a guard login directly to the guard view after gate selection", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);

      if (path === "/api/ui-settings") {
        return new Response(JSON.stringify({ backgroundMode: "plain", backgroundImageUrl: "", securityNumber: "BM2026" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (path === "/api/auth/me") {
        return new Response(JSON.stringify({ user: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (path === "/api/auth/login") {
        const body = JSON.parse(String(init?.body || "{}")) as { gateId?: string };
        const payload = body.gateId
          ? { user: guardUser, redirectTo: "/" }
          : { requiresGateSelection: true, gates: [{ id: "gate-1", name: "Hauptwache", description: null, location: null }] };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <ThemeProvider>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/wache" element={<div>Wache-Ansicht</div>} />
            </Routes>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    const usernameInput = await screen.findByLabelText(/Benutzername/);
    const passwordInput = screen.getByLabelText(/Passwort/);
    expect(usernameInput).toHaveAttribute("name", "username");
    expect(usernameInput).toHaveAttribute("autocomplete", "username");
    expect(passwordInput).toHaveAttribute("name", "password");
    expect(passwordInput).toHaveAttribute("autocomplete", "current-password");
    fireEvent.change(usernameInput, { target: { value: "wache.test" } });
    fireEvent.change(passwordInput, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByLabelText(/Aktive Wache/)).toHaveValue("gate-1");
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

    expect(await screen.findByText("Wache-Ansicht")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
      body: expect.stringContaining('"gateId":"gate-1"')
    }));
  });

  it("waits for the guard session and redirects from the root without rendering the public page", async () => {
    let resolveSession!: (response: Response) => void;
    const sessionResponse = new Promise<Response>((resolve) => {
      resolveSession = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => sessionResponse));

    renderRoutes("/");

    expect(screen.getByText("Anwendung wird geladen ...")).toBeInTheDocument();
    expect(screen.queryByText("Allgemeine Startseite")).not.toBeInTheDocument();

    await act(async () => {
      resolveSession(new Response(JSON.stringify({ user: guardUser }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));
    });

    expect(await screen.findByText("Wache-Ansicht")).toBeInTheDocument();
    expect(screen.queryByText("Allgemeine Startseite")).not.toBeInTheDocument();
  });

  it("keeps a reloaded guard route after restoring its gate-bound session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: guardUser }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })));

    renderRoutes("/wache");

    expect(await screen.findByText("Wache-Ansicht")).toBeInTheDocument();
    expect(screen.queryByText("Login")).not.toBeInTheDocument();
  });

  it("continues to protect the guard route for signed-out users", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })));

    renderRoutes("/wache");

    expect(await screen.findByText("Login")).toBeInTheDocument();
    expect(screen.queryByText("Wache-Ansicht")).not.toBeInTheDocument();
  });

  it("shows an access-denied page for an authenticated user with the wrong role", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: guardUser }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })));

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <ThemeProvider>
          <AuthProvider>
            <Routes>
              <Route path="/admin" element={<RequireRoles allowedRoles={["admin"]}><div>Admin</div></RequireRoles>} />
            </Routes>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Keine Berechtigung" })).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });
});
