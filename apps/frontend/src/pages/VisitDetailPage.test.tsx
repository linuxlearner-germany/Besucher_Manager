import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, ThemeProvider, type User } from "../app/core";
import { VisitDetailPage } from "./VisitDetailPage";

const guardUser: User = {
  id: "guard-1", username: "wache.test", role: "guard", roles: ["guard"], gateId: "gate-1", gateName: "Hauptwache", groups: [], menuAccess: ["wache"],
  permissions: {
    menu: { preRegistration: false, guard: true, import: false, admin: false, sibe: false, commander: false, texts: false },
    visits: { read: true, create: true, update: true, delete: false, checkIn: true, checkOut: true, printBadge: true },
    imports: { execute: false }, texts: { manage: false }, dashboards: { sibe: false, commander: false },
    admin: { users: false, guards: false, map: false, fields: false, system: false }, logs: { audit: false, errors: false }
  }
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("guard visit editing", () => {
  it("normalizes nullable optional data and saves fully completed required data", async () => {
    let submitted: Record<string, unknown> | null = null;
    const visit = {
      id: "visit-1", status: "pre_registered", validFrom: "2026-08-31T00:00:00.000Z", validUntil: "2026-08-31T23:59:59.999Z",
      checkInAt: null, checkOutAt: null, firstName: "Erika", lastName: "Muster", company: "Beispiel GmbH", nationalityCode: "DE", nationalityName: "Deutschland",
      birthDate: null, visitorPhone: null, visitorEmail: null, hostName: "Maria Muster", hostEmail: null, hostPhone: "12345", hostDepartment: null,
      purpose: "Besprechung", gateId: "gate-1", gateName: "Hauptwache", licensePlate: null, signedByHostConfirmed: false,
      hostSignatureStatus: "pending", hostSignatureDate: null, hostSignatureNote: null, hostSignatureConfirmedBy: null, hostSignatureConfirmedAt: null,
      checkoutNote: null, badgeNumber: "B-1", visitorStreet: "Musterstraße", visitorHouseNumber: "1", visitorPostalCode: "10115", visitorCity: "Berlin",
      visitorAddress: null, idDocumentType: "identity_card", idDocumentValidUntil: "2030-12-31", idDocumentNumber: "ABC123", idDocumentIssuingPlace: null,
      visitPurposeType: null, visitCompanyOrder: null, hostUnit: null, hostBuilding: null, hostRoom: null, hostExtension: null, visitEndType: null,
      forwardedToNote: null, devicePhotoApp: null, deviceFilmApp: null, deviceVideoCamera: null, deviceManufacturer: null, deviceSerialNumber: null,
      deviceAccessories: null, deviceDepositNote: null, deviceReturnConfirmed: null, deviceReturnedAt: null, deviceReturnedBy: null, checkInBy: null, checkOutBy: null,
      notes: null, siteMap: null, badgeTexts: [], completeness: { canCheckIn: true, canPrintBadge: true, canCheckOut: false, missingRequiredFields: [], errors: [], warnings: [], infos: [] }
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/auth/me") return json({ user: guardUser });
      if (path === "/api/ui-settings") return json({ backgroundMode: "plain", backgroundImageUrl: "", securityNumber: "BM2026" });
      if (path === "/api/countries") return json({ countries: [{ code: "DE", name: "Deutschland" }] });
      if (path === "/api/public/gates") return json({ gates: [{ id: "gate-1", name: "Hauptwache" }] });
      if (path === "/api/guard/visits/visit-1" && init?.method === "PUT") {
        submitted = JSON.parse(String(init.body));
        return json({ success: true });
      }
      if (path === "/api/guard/visits/visit-1") return json({ visit });
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<MemoryRouter initialEntries={["/wache/besuche/visit-1"]}><ThemeProvider><AuthProvider><Routes><Route path="/wache/besuche/:id" element={<VisitDetailPage />} /></Routes></AuthProvider></ThemeProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Daten bearbeiten" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[0]!);
    expect(await screen.findByText("Besuchsdaten wurden gespeichert.")).toBeInTheDocument();
    await waitFor(() => expect(submitted).not.toBeNull());
    expect(submitted?.hostDepartment).toBe("");
  });
});
