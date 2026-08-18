import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { User } from "../../app/core";

const mocks = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  user: null as User | null
}));

vi.mock("../../app/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../app/core")>();
  return {
    ...actual,
    fetchJson: mocks.fetchJson,
    useAuth: () => ({ user: mocks.user })
  };
});

import { NormalVisitorImportSection } from "./NormalVisitorImportSection";

const importUser: User = {
  id: "guard-import-1",
  username: "wache.import",
  role: "guard",
  roles: ["guard"],
  gateId: "gate-1",
  gateName: "Hauptwache",
  groups: [],
  menuAccess: ["wache", "import"],
  permissions: {
    menu: { preRegistration: false, guard: true, import: true, admin: false, sibe: false, commander: false, texts: false },
    visits: { read: true, create: true, update: false, delete: false, checkIn: true, checkOut: false, printBadge: false },
    imports: { execute: true },
    texts: { manage: false },
    dashboards: { sibe: false, commander: false },
    admin: { users: false, guards: false, map: false, fields: false, system: false },
    logs: { audit: false, errors: false }
  }
};

function renderImporter(props?: { publicMode?: boolean; csrfToken?: string }) {
  return render(<MemoryRouter><NormalVisitorImportSection {...props} /></MemoryRouter>);
}

function selectWorkbook() {
  const file = new File(["xlsx"], "regulaere-besucher.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  fireEvent.change(screen.getByLabelText("XLSX-Datei auswählen"), { target: { files: [file] } });
}

afterEach(() => {
  cleanup();
  mocks.fetchJson.mockReset();
  mocks.user = null;
});

describe("NormalVisitorImportSection", () => {
  it("is visible only with the existing normal-import permission", () => {
    mocks.user = importUser;
    const { rerender } = renderImporter();
    expect(screen.getByRole("heading", { name: "Mehrere Besucher per XLSX importieren" })).toBeInTheDocument();

    mocks.user = { ...importUser, menuAccess: ["wache"] };
    rerender(<MemoryRouter><NormalVisitorImportSection /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: "Mehrere Besucher per XLSX importieren" })).not.toBeInTheDocument();
  });

  it("previews and imports a valid workbook through the standard visitor endpoints", async () => {
    mocks.user = importUser;
    mocks.fetchJson
      .mockResolvedValueOnce({
        rows: [{ rowNumber: 2, firstName: "Erika", lastName: "Muster", company: "Beispiel GmbH", validFrom: "2026-08-20", validUntil: "2026-08-20", gateName: "Hauptwache", hostName: "Max Host", status: "ok", errors: [] }],
        total: 1,
        valid: 1,
        invalid: 0,
        errors: [],
        ignoredSampleRows: 0
      })
      .mockResolvedValueOnce({
        imported: 1,
        needsReview: 0,
        message: "1 Besucher importiert.",
        rows: [{ rowNumber: 2, visitId: "visit-1", visitorName: "Erika Muster", company: "Beispiel GmbH", missingFields: [], warnings: [], needsReview: false }]
      });
    renderImporter();

    selectWorkbook();
    fireEvent.click(screen.getByRole("button", { name: "Vorschau anzeigen" }));

    expect(await screen.findByText("1 Besucherzeile(n) erkannt: 1 gültig, 0 fehlerhaft.")).toBeInTheDocument();
    expect(mocks.fetchJson).toHaveBeenNthCalledWith(1, "/api/sibe/visits/import/preview", expect.objectContaining({ method: "POST" }));

    fireEvent.click(screen.getByRole("button", { name: "Import ausführen" }));
    expect(await screen.findByText("1 Besucher importiert.")).toBeInTheDocument();
    expect(mocks.fetchJson).toHaveBeenNthCalledWith(2, "/api/sibe/visits/import", expect.objectContaining({ method: "POST" }));
  });

  it("is usable without login through the CSRF-protected public visitor endpoints", async () => {
    mocks.user = null;
    mocks.fetchJson
      .mockResolvedValueOnce({
        rows: [{ rowNumber: 2, firstName: "Erika", lastName: "Muster", company: "Beispiel GmbH", validFrom: "2026-08-20", validUntil: "2026-08-20", gateName: "Hauptwache", hostName: "Max Host", status: "ok", errors: [] }],
        total: 1,
        valid: 1,
        invalid: 0,
        errors: [],
        ignoredSampleRows: 0
      })
      .mockResolvedValueOnce({
        imported: 1,
        needsReview: 0,
        message: "1 Besucher importiert.",
        rows: [{ rowNumber: 2, visitId: "visit-public-1", visitorName: "Erika Muster", company: "Beispiel GmbH", missingFields: [], warnings: [], needsReview: false }]
      });
    renderImporter({ publicMode: true, csrfToken: "csrf-public-import" });

    expect(screen.getByRole("heading", { name: "Mehrere Besucher per XLSX importieren" })).toBeInTheDocument();
    selectWorkbook();
    fireEvent.click(screen.getByRole("button", { name: "Vorschau anzeigen" }));
    expect(await screen.findByText("1 Besucherzeile(n) erkannt: 1 gültig, 0 fehlerhaft.")).toBeInTheDocument();
    expect(mocks.fetchJson).toHaveBeenNthCalledWith(1, "/api/public/visits/import/preview", expect.objectContaining({
      method: "POST",
      headers: { "X-CSRF-Token": "csrf-public-import" }
    }));

    fireEvent.click(screen.getByRole("button", { name: "Import ausführen" }));
    expect(await screen.findByText("1 Besucher importiert.")).toBeInTheDocument();
    expect(mocks.fetchJson).toHaveBeenNthCalledWith(2, "/api/public/visits/import", expect.objectContaining({
      method: "POST",
      headers: { "X-CSRF-Token": "csrf-public-import" }
    }));
    expect(screen.getByText("Login für Details")).toBeInTheDocument();
  });

  it("shows row errors and does not import an invalid preview", async () => {
    mocks.user = importUser;
    mocks.fetchJson.mockResolvedValueOnce({
      rows: [{ rowNumber: 8, firstName: "", lastName: "", company: "", validFrom: "", validUntil: "", gateName: "", hostName: "", status: "error", errors: ["Excel-Zeile 8: Nachname fehlt."] }],
      total: 1,
      valid: 0,
      invalid: 1,
      errors: [],
      ignoredSampleRows: 0
    });
    renderImporter();

    selectWorkbook();
    fireEvent.click(screen.getByRole("button", { name: "Vorschau anzeigen" }));

    expect(await screen.findByText("Excel-Zeile 8: Nachname fehlt.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import ausführen" })).toBeDisabled();
    await waitFor(() => expect(mocks.fetchJson).toHaveBeenCalledTimes(1));
  });
});
