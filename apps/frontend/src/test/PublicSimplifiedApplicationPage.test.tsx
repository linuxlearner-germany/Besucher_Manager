import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, ThemeProvider } from "../app/core";
import { PublicSimplifiedApplicationPage } from "../pages/PublicSimplifiedApplicationPage";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderPage(requireEmailVerification = true) {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const preview = {
    valid: true,
    ignoredSampleRows: 0,
    rows: [{ rowNumber: 2, firstName: "Erika", lastName: "Musterfrau", company: "Beispiel", validFrom: "2026-08-20", validUntil: "2026-08-20", gateName: "Hauptwache", hostName: "Max Mustermann", hostDepartment: "Fachbereich", licensePlate: null, warnings: [], errors: [] }]
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/api/auth/me")) return json({ user: null });
    if (url.includes("/api/ui-settings")) return json({ backgroundMode: "plain", backgroundImageUrl: "", securityNumber: "BM2026" });
    if (url.includes("/bootstrap")) return json({ csrfToken: "csrf", requireEmailVerification, limits: { maxBytes: 5 * 1024 * 1024, maxRows: 500, maxSheets: 3 } });
    if (url.endsWith("/preview")) return json(preview);
    if (url.endsWith("/api/public/simplified-applications")) return json({ reference: "VBA-2026-000123", status: "submitted", emailVerificationRequired: requireEmailVerification, entryCount: 1 }, 201);
    throw new Error(`Unexpected request: ${url}`);
  });
  render(<MemoryRouter initialEntries={["/visit/simplified/application"]}><ThemeProvider><AuthProvider><PublicSimplifiedApplicationPage /></AuthProvider></ThemeProvider></MemoryRouter>);
}

describe("PublicSimplifiedApplicationPage", () => {
  it("uses the simplified policy navigation and progressively reveals the form", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Vereinfachte Besucherregelung" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vereinfachte Besucherregelung" })).toHaveClass("active-link");
    expect(screen.queryByText("XLSX-Antrag")).not.toBeInTheDocument();
    expect(screen.queryByText("Ihre Kontaktdaten")).not.toBeInTheDocument();

    const file = new File(["xlsx"], "eine-sehr-lange-dateibezeichnung-fuer-besucher-im-august.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(screen.getByLabelText("XLSX-Datei auswählen"), { target: { files: [file] } });
    expect(screen.getByText(file.name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Datei prüfen und Vorschau anzeigen" }));

    expect(await screen.findByRole("heading", { name: "Besucherdaten prüfen" })).toBeInTheDocument();
    expect(screen.getByText("Ihre Kontaktdaten")).toBeInTheDocument();
    expect(screen.getByText(/Nach dem Absenden müssen Sie Ihre E-Mail-Adresse bestätigen/)).toBeInTheDocument();
  });

  it("submits once and keeps the result visible until a new application is started", async () => {
    renderPage(false);
    await screen.findByRole("heading", { name: "Vereinfachte Besucherregelung" });
    fireEvent.change(screen.getByLabelText("XLSX-Datei auswählen"), { target: { files: [new File(["xlsx"], "besucher.xlsx")] } });
    fireEvent.click(screen.getByRole("button", { name: "Datei prüfen und Vorschau anzeigen" }));
    await screen.findByRole("heading", { name: "Ihre Kontaktdaten" });
    expect(screen.queryByText(/Nach dem Absenden müssen Sie Ihre E-Mail-Adresse bestätigen/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("E-Mail-Adresse *"), { target: { value: "mitarbeiter@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Antrag der vereinfachten Besucherregelung absenden" }));
    expect(await screen.findByRole("heading", { name: "Antrag erfolgreich eingereicht" })).toBeInTheDocument();
    expect(screen.getByText(/VBA-2026-000123/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Neue Anmeldung starten" })).toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(5));
  });

  it("marks an invalid applicant e-mail before submit and keeps submit disabled", async () => {
    renderPage(false);
    await screen.findByRole("heading", { name: "Vereinfachte Besucherregelung" });
    fireEvent.change(screen.getByLabelText("XLSX-Datei auswählen"), { target: { files: [new File(["xlsx"], "besucher.xlsx")] } });
    fireEvent.click(screen.getByRole("button", { name: "Datei prüfen und Vorschau anzeigen" }));
    await screen.findByRole("heading", { name: "Ihre Kontaktdaten" });

    const email = screen.getByRole("textbox", { name: "E-Mail-Adresse" });
    const submit = screen.getByRole("button", { name: "Antrag der vereinfachten Besucherregelung absenden" });
    fireEvent.change(email, { target: { value: "ungueltig" } });

    expect(submit).toBeDisabled();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "applicant-email-error");
    expect(screen.getByText("Bitte geben Sie eine gültige E-Mail-Adresse ein.")).toHaveAttribute("role", "alert");
  });

  it("reuses one client request id when a submit is retried", async () => {
    let submitCount = 0;
    const requestIds: string[] = [];
    const validPreview = {
      valid: true,
      ignoredSampleRows: 0,
      rows: [{ rowNumber: 2, firstName: "Erika", lastName: "Musterfrau", company: null, validFrom: "2026-08-20", validUntil: "2026-08-20", gateName: "Hauptwache", hostName: null, hostDepartment: null, licensePlate: null, warnings: [], errors: [] }]
    };
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    global.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return json({ user: null });
      if (url.includes("/api/ui-settings")) return json({ backgroundMode: "plain", backgroundImageUrl: "", securityNumber: "BM2026" });
      if (url.endsWith("/bootstrap")) return json({ csrfToken: "csrf", requireEmailVerification: true, limits: { maxBytes: 5_242_880, maxRows: 500, maxSheets: 3 } });
      if (url.endsWith("/preview")) return json(validPreview);
      if (url.endsWith("/api/public/simplified-applications")) {
        const body = init?.body as FormData;
        requestIds.push(String(body.get("clientRequestId")));
        submitCount += 1;
        if (submitCount === 1) return json({ status: 503, error: "VERIFICATION_MAIL_FAILED", message: "Bitte versuchen Sie es später erneut." }, 503);
        return json({ reference: "VBA-2026-000123", status: "pending_email_verification", emailVerificationRequired: true, entryCount: 1 }, 201);
      }
      return json({});
    }) as typeof fetch;

    render(<MemoryRouter><ThemeProvider><AuthProvider><PublicSimplifiedApplicationPage /></AuthProvider></ThemeProvider></MemoryRouter>);
    await screen.findByRole("heading", { name: "Vereinfachte Besucherregelung" });
    fireEvent.change(screen.getByLabelText("XLSX-Datei auswählen"), { target: { files: [new File(["xlsx"], "besucher.xlsx")] } });
    fireEvent.click(screen.getByRole("button", { name: "Datei prüfen und Vorschau anzeigen" }));
    await screen.findByRole("heading", { name: "Ihre Kontaktdaten" });
    fireEvent.change(screen.getByRole("textbox", { name: /e-mail-adresse/i }), { target: { value: "test@example.org" } });
    fireEvent.click(screen.getByRole("button", { name: /antrag der vereinfachten/i }));
    await screen.findByText(/bitte versuchen sie es später/i);
    fireEvent.click(screen.getByRole("button", { name: /antrag der vereinfachten/i }));
    await screen.findByText(/antrag erfolgreich eingereicht/i);

    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(requestIds[1]).toBe(requestIds[0]);
  });
});
