import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicPreRegistrationConfirmationPage, type PublicPreRegistrationDetail } from "./PublicPreRegistrationConfirmationPage";

const TOKEN = "T".repeat(43);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function detail(overrides: Partial<PublicPreRegistrationDetail> = {}): PublicPreRegistrationDetail {
  return {
    firstName: "Max", lastName: "Mustermann", company: "Muster GmbH", phone: "030 123-45", email: "max@example.org",
    licensePlate: "B-MM 123", purpose: "Besprechung", hostName: "Erika Empfang", hostPhone: "040 123", hostDepartment: "IT",
    validFrom: "2099-08-20", validUntil: "2099-08-20", expectedArrivalTime: "08:30",
    gateName: "Hauptwache", gateLocation: "Werk Nord", status: "pre_registered", editable: true, editMessage: null,
    recipientUpdatedAt: null, version: "a".repeat(64), ...overrides
  };
}

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function renderPage(token = TOKEN) {
  return render(
    <MemoryRouter initialEntries={[`/visit/confirmation#${token}`]}>
      <PublicPreRegistrationConfirmationPage />
    </MemoryRouter>
  );
}

describe("public pre-registration confirmation", () => {
  it("shows an understandable read-only overview without authentication or internal fields", async () => {
    const fetchMock = vi.fn(() => response({ preRegistration: detail() }));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Voranmeldung wird geladen");
    expect(await screen.findByRole("heading", { level: 1, name: "Voranmeldung für Ihren Besuch" })).toBeInTheDocument();
    expect(screen.getByText("Voranmeldung erfasst")).toBeInTheDocument();
    expect(screen.getByText("Sie können Ihre Angaben noch bis zum Beginn Ihres Besuchstags ändern.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Besucher" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Besuch" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ansprechpartner" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Für Ihren Besuch" })).toBeInTheDocument();
    expect(screen.getAllByText("Hauptwache · Werk Nord")).toHaveLength(2);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Audit|Request-ID|Benutzer-ID|Ausweisnummer|Login/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/public/pre-registration-confirmation");
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).get("X-Confirmation-Token")).toBe(TOKEN);
  });

  it("focuses the first optional field, accepts tolerant values, saves once and returns to detail view", async () => {
    let finishSave!: (value: Response) => void;
    const saveResponse = new Promise<Response>((resolve) => { finishSave = resolve; });
    const updated = detail({
      firstName: "Maria",
      phone: "+49 (30) 123-45",
      licensePlate: "b mm  456",
      recipientUpdatedAt: "2026-08-14T08:45:00.000Z",
      version: "b".repeat(64)
    });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({ preRegistration: detail() }))
      .mockImplementationOnce(() => saveResponse);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Angaben bearbeiten" }));
    const firstName = screen.getByLabelText("Vorname");
    expect(firstName).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Festgelegte Besuchsdaten" })).toBeInTheDocument();
    expect(screen.getByText("Alle folgenden Felder sind optional. Leere Felder können gespeichert werden.")).toBeInTheDocument();
    expect(document.querySelector(".required-indicator")).toBeNull();

    fireEvent.change(firstName, { target: { value: "Maria" } });
    fireEvent.change(screen.getByLabelText("Telefonnummer"), { target: { value: "+49 (30) 123-45" } });
    fireEvent.change(screen.getByLabelText("Kennzeichen"), { target: { value: "b mm  456" } });
    fireEvent.change(screen.getByLabelText("Besuchsgrund"), { target: { value: "  Workshop am Standort  " } });
    const saveButton = screen.getByRole("button", { name: "Änderungen speichern" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    expect(screen.getByRole("button", { name: "Änderungen werden gespeichert …" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    finishSave(new Response(JSON.stringify({ message: "Ihre Änderungen wurden erfolgreich gespeichert.", preRegistration: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    expect(await screen.findByText("Ihre Änderungen wurden erfolgreich gespeichert.")).toBeInTheDocument();
    expect(screen.getByText(/Zuletzt von Ihnen aktualisiert:/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Änderungen speichern" })).not.toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toMatchObject({
      firstName: "Maria",
      phone: "+49 (30) 123-45",
      licensePlate: "b mm  456",
      purpose: "  Workshop am Standort  ",
      version: "a".repeat(64)
    });
  });

  it("only warns before cancelling when values were actually changed", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ preRegistration: detail() })));
    const confirmMock = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirmMock);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Angaben bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(confirmMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Angaben bearbeiten" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Angaben bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Firma"), { target: { value: "Andere Firma" } });
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Firma")).toHaveValue("Andere Firma");
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(confirmMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Angaben bearbeiten" })).toBeInTheDocument();
  });

  it("warns the browser about unsaved changes but not about an unchanged form", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ preRegistration: detail() })));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Angaben bearbeiten" }));

    const unchangedEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unchangedEvent);
    expect(unchangedEvent.defaultPrevented).toBe(false);

    fireEvent.change(screen.getByLabelText("Nachname"), { target: { value: "Geändert" } });
    const changedEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(changedEvent);
    expect(changedEvent.defaultPrevented).toBe(true);
  });

  it("explains a locked visit without rendering edit controls", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({
      preRegistration: detail({ editable: false, status: "checked_in", editMessage: "Diese Voranmeldung kann nach dem Check-in nicht mehr geändert werden." })
    })));
    renderPage();

    expect(await screen.findByText("Diese Voranmeldung kann nicht mehr geändert werden.")).toBeInTheDocument();
    expect(screen.getByText("Der Besuch hat bereits begonnen.")).toBeInTheDocument();
    expect(screen.getByText("Besucher eingecheckt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Angaben bearbeiten" })).not.toBeInTheDocument();
  });

  it.each([
    ["PUBLIC_CONFIRMATION_NOT_FOUND", 404, "Dieser Bestätigungslink ist ungültig."],
    ["PUBLIC_CONFIRMATION_EXPIRED", 410, "Dieser Bestätigungslink ist nicht mehr gültig."],
    ["PUBLIC_CONFIRMATION_REVOKED", 410, "Diese Voranmeldung wurde storniert, abgelehnt oder ist nicht mehr verfügbar."]
  ])("translates %s into a public message without a login prompt", async (error, status, message) => {
    vi.stubGlobal("fetch", vi.fn(() => response({ status, error, message: "technical", requestId: "req-public" }, status)));
    renderPage();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/Anmeldung erforderlich|Login/)).not.toBeInTheDocument();
  });

  it("offers a reload with fresh data after a version conflict", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({ preRegistration: detail() }))
      .mockImplementationOnce(() => response({ status: 409, error: "PUBLIC_CONFIRMATION_CONFLICT", message: "conflict", requestId: "req-conflict" }, 409))
      .mockImplementationOnce(() => response({ preRegistration: detail({ firstName: "Aktuell", version: "c".repeat(64) }) }));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Angaben bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Veraltet" } });
    fireEvent.submit(screen.getByRole("button", { name: "Änderungen speichern" }).closest("form")!);
    expect(await screen.findByText("Die Voranmeldung wurde zwischenzeitlich geändert. Bitte laden Sie die aktuellen Daten neu.")).toBeInTheDocument();
    expect(screen.getByText("Support-Referenz: req-conflict")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Neu laden" }));
    expect(await screen.findByText("Aktuell")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Veraltet")).not.toBeInTheDocument();
  });

  it("associates server validation feedback with the affected field", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({ preRegistration: detail() }))
      .mockImplementationOnce(() => response({
        status: 400,
        error: "VALIDATION_ERROR",
        message: "Bitte prüfen Sie Ihre Eingaben.",
        details: { fieldErrors: { email: ["Ungültige E-Mail-Adresse."] } }
      }, 400));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Angaben bearbeiten" }));
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "ungueltig" } });
    fireEvent.submit(screen.getByRole("button", { name: "Änderungen speichern" }).closest("form")!);

    const input = await screen.findByLabelText("E-Mail");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "email-error");
    expect(screen.getByText("Ungültige E-Mail-Adresse.")).toHaveAttribute("role", "alert");
  });

  it("shows a retryable message when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    renderPage();
    expect(await screen.findByText("Die Verbindung zum Server konnte nicht hergestellt werden. Bitte versuchen Sie es erneut.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Neu laden" })).toBeInTheDocument();
  });

  it("keeps every edit control and action available at a small mobile viewport", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    vi.stubGlobal("fetch", vi.fn(() => response({ preRegistration: detail({ email: "eine.sehr.lange.emailadresse-fuer-mobile@example.test", purpose: "Langer Besuchsgrund ".repeat(20) }) })));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Angaben bearbeiten" }));
    expect(screen.getAllByRole("textbox")).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Änderungen speichern" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeVisible();
    expect(screen.getByLabelText("Telefonnummer")).toHaveAttribute("inputmode", "tel");
    expect(screen.getByLabelText("E-Mail")).toHaveAttribute("inputmode", "email");
  });

  it("does not render stale details when the fragment token changes", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({ preRegistration: detail() }))
      .mockImplementationOnce(() => response({ preRegistration: detail({ firstName: "Neu" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const rendered = renderPage();
    expect(await screen.findByText("Max")).toBeInTheDocument();
    rendered.rerender(<MemoryRouter key="second-token" initialEntries={[`/visit/confirmation#${"U".repeat(43)}`]}><PublicPreRegistrationConfirmationPage /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText("Max")).not.toBeInTheDocument());
    expect(await screen.findByText("Neu")).toBeInTheDocument();
  });
});
