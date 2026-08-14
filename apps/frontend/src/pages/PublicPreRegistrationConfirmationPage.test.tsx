import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicPreRegistrationConfirmationPage, type PublicPreRegistrationDetail } from "./PublicPreRegistrationConfirmationPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function detail(overrides: Partial<PublicPreRegistrationDetail> = {}): PublicPreRegistrationDetail {
  return {
    firstName: "Max", lastName: "Mustermann", company: "Muster GmbH", phone: "030 123-45", email: "max@example.org",
    licensePlate: "B-MM 123", purpose: "Besprechung", hostName: "Erika Empfang", hostPhone: "040 123", hostDepartment: "IT",
    validFrom: "2099-08-20T00:00:00.000Z", validUntil: "2099-08-20T23:59:59.999Z", expectedArrivalTime: "08:30",
    gateName: "Hauptwache", gateLocation: "Werk Nord", status: "pre_registered", editable: true, editMessage: null,
    recipientUpdatedAt: null, version: "a".repeat(64), ...overrides
  };
}

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("public pre-registration confirmation", () => {
  it("loads without authentication and only renders recipient fields", async () => {
    const fetchMock = vi.fn(() => response({ preRegistration: detail() }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryRouter initialEntries={[`/visit/confirmation#${"T".repeat(43)}`]}><PublicPreRegistrationConfirmationPage /></MemoryRouter>);
    expect(await screen.findByText("Max")).toBeInTheDocument();
    expect(screen.getByText("Hauptwache · Werk Nord")).toBeInTheDocument();
    expect(screen.queryByText(/Audit|Request-ID|Benutzer-ID|Ausweisnummer/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/public/pre-registration-confirmation");
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).get("X-Confirmation-Token")).toBe("T".repeat(43));
  });

  it("edits allowlisted fields, clears an optional field and shows confirmation", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({ preRegistration: detail() }))
      .mockImplementationOnce(() => response({ message: "Ihre Änderungen wurden erfolgreich gespeichert.", preRegistration: detail({ firstName: "Maria", phone: null, version: "b".repeat(64) }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryRouter initialEntries={[`/visit/confirmation#${"T".repeat(43)}`]}><PublicPreRegistrationConfirmationPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Angaben bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Maria" } });
    fireEvent.change(screen.getByLabelText("Telefon Besucher"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    expect(await screen.findByText("Ihre Änderungen wurden erfolgreich gespeichert.")).toBeInTheDocument();
    const patchCall = fetchMock.mock.calls[1];
    expect(patchCall[0]).toBe("/api/public/pre-registration-confirmation");
    expect(JSON.parse((patchCall[1] as RequestInit).body as string)).toMatchObject({ firstName: "Maria", phone: "", version: "a".repeat(64) });
  });

  it("shows specific invalid and expired link messages without a login prompt", async () => {
    const fetchMock = vi.fn(() => response({ status: 410, error: "PUBLIC_CONFIRMATION_EXPIRED", message: "Dieser Bestätigungslink ist nicht mehr gültig." }, 410));
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryRouter initialEntries={[`/visit/confirmation#${"T".repeat(43)}`]}><PublicPreRegistrationConfirmationPage /></MemoryRouter>);
    expect(await screen.findByText("Dieser Bestätigungslink ist nicht mehr gültig.")).toBeInTheDocument();
    expect(screen.queryByText(/Anmeldung erforderlich|Login/)).not.toBeInTheDocument();
  });

  it("disables editing after check-in and does not render stale data while token changes", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({ preRegistration: detail({ editable: false, status: "checked_in", editMessage: "Diese Voranmeldung kann nach dem Check-in nicht mehr geändert werden." }) }))
      .mockImplementationOnce(() => response({ preRegistration: detail({ firstName: "Neu" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const rendered = render(<MemoryRouter initialEntries={[`/visit/confirmation#${"T".repeat(43)}`]}><PublicPreRegistrationConfirmationPage /></MemoryRouter>);
    expect(await screen.findByText(/nach dem Check-in/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Angaben bearbeiten" })).not.toBeInTheDocument();
    rendered.rerender(<MemoryRouter key="second-token" initialEntries={[`/visit/confirmation#${"U".repeat(43)}`]}><PublicPreRegistrationConfirmationPage /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText("Max")).not.toBeInTheDocument());
  });
});
