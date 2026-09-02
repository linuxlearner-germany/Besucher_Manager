import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, ThemeProvider, type User } from "../app/core";
import { GuardDashboardPage } from "./GuardDashboardPage";

const guardUser: User = {
  id: "guard-1",
  username: "wache.test",
  role: "guard",
  roles: ["guard"],
  gateId: "11111111-1111-4111-8111-111111111111",
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

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function renderGuard(walkInResponse: (body: Record<string, unknown>) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === "/api/auth/me") return jsonResponse({ user: guardUser });
    if (path === "/api/ui-settings") return jsonResponse({ backgroundMode: "plain", backgroundImageUrl: "", securityNumber: "BM2026" });
    if (path === "/api/countries") return jsonResponse({ countries: [{ code: "DE", name: "Deutschland" }] });
    if (path.startsWith("/api/guard/visits/today?")) return jsonResponse({ visits: [] });
    if (path.startsWith("/api/guard/visits/calendar?")) return jsonResponse({ items: [] });
    if (path === "/api/guard/visits/walk-in") {
      return walkInResponse(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthProvider>
          <GuardDashboardPage />
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("walk-in form", () => {
  it("shows invalid optional e-mail locally before sending the request", async () => {
    const fetchMock = renderGuard(() => jsonResponse({ message: "unexpected" }, 500));

    fireEvent.click(await screen.findByRole("button", { name: "Spontanbesucher anmelden" }));
    const email = screen.getByRole("textbox", { name: "E-Mail Besucher" });
    fireEvent.change(email, { target: { value: "ungueltig" } });
    fireEvent.click(screen.getByRole("button", { name: "Besuch speichern" }));

    expect(await screen.findByText("Die E-Mail-Adresse hat kein gültiges Format.")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveFocus();
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/guard/visits/walk-in")).toBe(false);
  });

  it("shows backend validation at the affected field and focuses it", async () => {
    renderGuard(() => jsonResponse({
      status: 400,
      error: "VALIDATION_ERROR",
      message: "Bitte prüfen Sie die eingegebenen Daten.",
      requestId: "request-1",
      details: { fieldErrors: { email: ["Die E-Mail-Adresse hat kein gültiges Format."] } }
    }, 400));

    fireEvent.click(await screen.findByRole("button", { name: "Spontanbesucher anmelden" }));
    const email = screen.getByRole("textbox", { name: "E-Mail Besucher" });
    fireEvent.change(email, { target: { value: "ungueltig" } });
    fireEvent.click(screen.getByRole("button", { name: "Besuch speichern" }));

    expect(await screen.findByText("Die E-Mail-Adresse hat kein gültiges Format.")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveFocus();
  });

  it("submits a minimal new visitor with null existingVisitorId exactly once", async () => {
    let submittedBody: Record<string, unknown> | null = null;
    renderGuard((body) => {
      submittedBody = body;
      return jsonResponse({ message: "Besuch wurde gespeichert.", badgeNumber: "TEST1", visitId: "visit-1", status: "pre_registered", warnings: [] }, 201);
    });

    fireEvent.click(await screen.findByRole("button", { name: "Spontanbesucher anmelden" }));
    expect(screen.getByRole("textbox", { name: /Aktive Sitzung-Wache/ })).toHaveValue("Hauptwache");
    fireEvent.click(screen.getByRole("button", { name: "Besuch speichern" }));

    expect(await screen.findByText(/Besuch wurde gespeichert.*TEST1/)).toBeInTheDocument();
    await waitFor(() => expect(submittedBody).not.toBeNull());
    expect(submittedBody?.existingVisitorId).toBeNull();
    expect(submittedBody?.action).toBe("save");
  });
});
