import { useEffect, useMemo, useState, type FormEvent } from "react";

type Gate = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
};

type FormState = {
  firstName: string;
  lastName: string;
  company: string;
  hostName: string;
  hostDepartment: string;
  purpose: string;
  gateId: string;
  validFrom: string;
  validUntil: string;
  phone: string;
  email: string;
  licensePlate: string;
  notes: string;
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "success"; visitId: string; status: string }
  | { kind: "error"; message: string };

type GatesResponse = {
  gates: Gate[];
  csrfToken: string;
};

function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function buildInitialFormState(): FormState {
  const validFrom = new Date();
  const validUntil = new Date(validFrom.getTime() + 2 * 60 * 60 * 1000);

  return {
    firstName: "",
    lastName: "",
    company: "",
    hostName: "",
    hostDepartment: "",
    purpose: "",
    gateId: "",
    validFrom: toLocalInputValue(validFrom),
    validUntil: toLocalInputValue(validUntil),
    phone: "",
    email: "",
    licensePlate: "",
    notes: ""
  };
}

function App() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [loadingGates, setLoadingGates] = useState(true);
  const [gateError, setGateError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => buildInitialFormState());
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    async function loadGates() {
      setLoadingGates(true);
      setGateError(null);

      try {
        const response = await fetch("/api/public/gates");

        if (!response.ok) {
          throw new Error("Die Wachen konnten nicht geladen werden.");
        }

        const payload = (await response.json()) as GatesResponse;
        setGates(payload.gates);
        setCsrfToken(payload.csrfToken);
        setForm((current) => ({
          ...current,
          gateId: current.gateId || payload.gates[0]?.id || ""
        }));
      } catch (error) {
        setGateError(error instanceof Error ? error.message : "Die Wachen konnten nicht geladen werden.");
      } finally {
        setLoadingGates(false);
      }
    }

    void loadGates();
  }, []);

  const selectedGate = useMemo(
    () => gates.find((gate) => gate.id === form.gateId) ?? null,
    [form.gateId, gates]
  );

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitState({ kind: "idle" });

    try {
      const response = await fetch("/api/public/pre-registrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({
          ...form,
          validFrom: new Date(form.validFrom).toISOString(),
          validUntil: new Date(form.validUntil).toISOString()
        })
      });

      const payload = (await response.json()) as
        | { visitId: string; status: string }
        | { error: string; retryAfterSeconds?: number };

      if (!response.ok) {
        if ("error" in payload && payload.error === "rate_limited") {
          throw new Error(`Zu viele Anfragen. Bitte in ${payload.retryAfterSeconds ?? 0} Sekunden erneut versuchen.`);
        }

        if ("error" in payload && payload.error === "csrf_failed") {
          throw new Error("Die Sitzung fuer das Formular ist abgelaufen. Bitte Seite neu laden.");
        }

        throw new Error("Die Voranmeldung konnte nicht gespeichert werden.");
      }

      if (!("visitId" in payload)) {
        throw new Error("Die API-Antwort ist unvollstaendig.");
      }

      setSubmitState({
        kind: "success",
        visitId: payload.visitId,
        status: payload.status
      });
      setForm((current) => ({
        ...buildInitialFormState(),
        gateId: current.gateId
      }));
    } catch (error) {
      setSubmitState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unbekannter Fehler"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Interne Besucherverwaltung</p>
          <h1>Voranmeldung Besucher</h1>
        </div>
        <div className="status">
          <span className="status-dot" />
          Internes Formular ohne Login
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="section-header">
            <div>
              <h2>Besuch anmelden</h2>
              <p className="section-copy">Die zustaendige Wache sieht den Eintrag sofort in der Tagesuebersicht.</p>
            </div>
          </div>

          <form className="pre-registration-form" onSubmit={handleSubmit}>
            <div className="form-section">
              <h3>Besucher</h3>
              <div className="form-grid two-columns">
                <label>
                  Vorname
                  <input
                    required
                    value={form.firstName}
                    onChange={(event) => updateField("firstName", event.target.value)}
                  />
                </label>
                <label>
                  Nachname
                  <input
                    required
                    value={form.lastName}
                    onChange={(event) => updateField("lastName", event.target.value)}
                  />
                </label>
                <label>
                  Firma / Organisation
                  <input
                    required
                    value={form.company}
                    onChange={(event) => updateField("company", event.target.value)}
                  />
                </label>
                <label>
                  Telefonnummer
                  <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
                </label>
                <label>
                  E-Mail-Adresse
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                  />
                </label>
                <label>
                  Kennzeichen
                  <input
                    value={form.licensePlate}
                    onChange={(event) => updateField("licensePlate", event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="form-section">
              <h3>Besuch</h3>
              <div className="form-grid two-columns">
                <label>
                  Ansprechpartner
                  <input
                    required
                    value={form.hostName}
                    onChange={(event) => updateField("hostName", event.target.value)}
                  />
                </label>
                <label>
                  Abteilung / Bereich
                  <input
                    required
                    value={form.hostDepartment}
                    onChange={(event) => updateField("hostDepartment", event.target.value)}
                  />
                </label>
                <label>
                  Besuchszweck
                  <input
                    required
                    value={form.purpose}
                    onChange={(event) => updateField("purpose", event.target.value)}
                  />
                </label>
                <label>
                  Zustaendige Wache
                  <select
                    required
                    value={form.gateId}
                    onChange={(event) => updateField("gateId", event.target.value)}
                    disabled={loadingGates || gates.length === 0}
                  >
                    {loadingGates ? <option>Wachen werden geladen...</option> : null}
                    {!loadingGates && gates.length === 0 ? <option>Keine Wachen konfiguriert</option> : null}
                    {gates.map((gate) => (
                      <option key={gate.id} value={gate.id}>
                        {gate.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Gueltig von
                  <input
                    required
                    type="datetime-local"
                    value={form.validFrom}
                    onChange={(event) => updateField("validFrom", event.target.value)}
                  />
                </label>
                <label>
                  Gueltig bis
                  <input
                    required
                    type="datetime-local"
                    value={form.validUntil}
                    onChange={(event) => updateField("validUntil", event.target.value)}
                  />
                </label>
              </div>
              <label>
                Bemerkung
                <textarea rows={4} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={isSubmitting || loadingGates || gates.length === 0 || !csrfToken}>
                {isSubmitting ? "Speichert..." : "Voranmeldung senden"}
              </button>
              <p className="inline-note">Es wird kein Benutzerkonto benoetigt. Zeitpunkt und IP-Adresse werden serverseitig protokolliert.</p>
            </div>

            {submitState.kind === "success" ? (
              <div className="feedback success">
                Voranmeldung gespeichert. Besuchs-ID: <strong>{submitState.visitId}</strong> Status: <strong>{submitState.status}</strong>
              </div>
            ) : null}

            {submitState.kind === "error" ? <div className="feedback error">{submitState.message}</div> : null}
            {gateError ? <div className="feedback error">{gateError}</div> : null}
          </form>
        </section>

        <aside className="panel side-panel">
          <h2>Aktuelle Auswahl</h2>
          <dl className="details-list">
            <div>
              <dt>Wache</dt>
              <dd>{selectedGate?.name ?? "Noch nicht gewaehlt"}</dd>
            </div>
            <div>
              <dt>Standort</dt>
              <dd>{selectedGate?.location || "Keine Angabe"}</dd>
            </div>
            <div>
              <dt>Hinweis</dt>
              <dd>{selectedGate?.description || "Keine Zusatzbeschreibung hinterlegt."}</dd>
            </div>
          </dl>

          <div className="callout">
            Fuer die MVP-Pforte folgen als naechstes Login, Tagesuebersicht, Check-in/Check-out und die Druckansicht des Besucherscheins.
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
