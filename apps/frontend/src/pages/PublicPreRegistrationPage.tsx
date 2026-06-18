import { useEffect, useState, type FormEvent } from "react";
import { Alert, Card, FormField } from "../components/ui";
import {
  AppLayout,
  type ApiError,
  buildInitialFormState,
  extractFieldErrors,
  fetchJson,
  type FieldErrorState,
  type FormState,
  toDateInputValue
} from "../app/core";

type PublicSubmitState =
  | { kind: "idle" }
  | { kind: "success"; message: string; visitId: string; visitorId: string; status: string }
  | { kind: "error"; message: string };

export function PublicPreRegistrationPage() {
  const [form, setForm] = useState<FormState>(() => buildInitialFormState());
  const [submitState, setSubmitState] = useState<PublicSubmitState>({ kind: "idle" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrorState>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [activeGateCount, setActiveGateCount] = useState(0);

  useEffect(() => {
    async function loadCsrf() {
      try {
        const payload = await fetchJson<{ csrfToken: string; gates: Array<{ id: string }> }>("/api/public/gates", { method: "GET", headers: {} });
        setCsrfToken(payload.csrfToken);
        setActiveGateCount(payload.gates.length);
      } catch {
        setCsrfToken("");
        setActiveGateCount(0);
      }
    }

    void loadCsrf();
  }, []);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitState({ kind: "idle" });
    setFieldErrors({});

    try {
      const payload = await fetchJson<{ message: string; visitId: string; visitorId: string; status: string }>("/api/public/pre-registrations", {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({
          ...form,
          birthDate: form.birthDate || "",
          validFrom: form.validFrom,
          validUntil: form.validUntil
        })
      });

      setSubmitState({
        kind: "success",
        message: payload.message || "Voranmeldung wurde erfolgreich gespeichert.",
        visitId: payload.visitId,
        visitorId: payload.visitorId,
        status: payload.status
      });
      setForm(buildInitialFormState());
    } catch (error) {
      const apiError = error as ApiError;
      setFieldErrors(extractFieldErrors(apiError) as FieldErrorState);
      setSubmitState({
        kind: "error",
        message:
          apiError.error === "FORBIDDEN"
            ? "Die Sitzung fuer das Formular ist abgelaufen. Bitte Seite neu laden."
            : apiError.message || "Die Voranmeldung konnte nicht gespeichert werden."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <main className="page-panel page-shell-form public-page-shell">
        <section className="panel public-form-panel">
          <div className="section-header">
            <div>
              <h2>Voranmeldung Besucher</h2>
              <p className="section-copy">Erfassen Sie Besuchsdaten und Ansprechpartner fuer die Wache.</p>
            </div>
          </div>

          <form className="pre-registration-form" onSubmit={handleSubmit}>
            <div className="form-section">
              <h3>Besucher</h3>
              <div className="form-grid two-columns">
                <FormField label="Vorname" required error={fieldErrors.firstName}>
                  <input required value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} />
                </FormField>
                <FormField label="Nachname" required error={fieldErrors.lastName}>
                  <input required value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} />
                </FormField>
                <FormField label="Firma / Organisation" required error={fieldErrors.company}>
                  <input required value={form.company} onChange={(event) => updateField("company", event.target.value)} />
                </FormField>
                <FormField label="Geburtsdatum" error={fieldErrors.birthDate}>
                  <input type="date" max={toDateInputValue(new Date())} value={form.birthDate} onChange={(event) => updateField("birthDate", event.target.value)} />
                </FormField>
                <FormField label="Telefonnummer">
                  <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
                </FormField>
                <FormField label="E-Mail-Adresse">
                  <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
                </FormField>
                <FormField label="Kennzeichen">
                  <input value={form.licensePlate} onChange={(event) => updateField("licensePlate", event.target.value)} />
                </FormField>
                <FormField label="Besuchszweck" required error={fieldErrors.purpose}>
                  <input required value={form.purpose} onChange={(event) => updateField("purpose", event.target.value)} />
                </FormField>
              </div>
            </div>

            <div className="form-section">
              <h3>Ansprechpartner</h3>
              <div className="form-grid two-columns">
                <FormField label="Ansprechpartner" required error={fieldErrors.hostName}>
                  <input required value={form.hostName} onChange={(event) => updateField("hostName", event.target.value)} />
                </FormField>
                <FormField label="Ansprechpartner E-Mail">
                  <input type="email" value={form.hostEmail} onChange={(event) => updateField("hostEmail", event.target.value)} />
                </FormField>
                <FormField label="Ansprechpartner Telefon" required error={fieldErrors.hostPhone}>
                  <input required value={form.hostPhone} onChange={(event) => updateField("hostPhone", event.target.value)} />
                </FormField>
                <FormField label="Abteilung / Bereich" error={fieldErrors.hostDepartment}>
                  <input value={form.hostDepartment} onChange={(event) => updateField("hostDepartment", event.target.value)} />
                </FormField>
                <FormField label="Gueltig von" required error={fieldErrors.validFrom}>
                  <input required type="date" value={form.validFrom} onChange={(event) => updateField("validFrom", event.target.value)} />
                </FormField>
                <FormField label="Gueltig bis" required error={fieldErrors.validUntil}>
                  <input required type="date" value={form.validUntil} onChange={(event) => updateField("validUntil", event.target.value)} />
                </FormField>
              </div>

              <FormField label="Bemerkung">
                <textarea rows={4} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
              </FormField>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={isSubmitting || !csrfToken}>
                {isSubmitting ? "Speichert..." : "Voranmeldung senden"}
              </button>
            </div>

            {submitState.kind === "success" ? (
              <div className="public-success-block">
                <Alert type="success">{submitState.message}</Alert>
                <div className="public-reference-grid">
                  <div className="public-reference-card">
                    <span className="public-reference-label">Besuchs-ID</span>
                    <code>{submitState.visitId}</code>
                  </div>
                  <div className="public-reference-card">
                    <span className="public-reference-label">Besucher-ID</span>
                    <code>{submitState.visitorId}</code>
                  </div>
                  <div className="public-reference-card">
                    <span className="public-reference-label">Status</span>
                    <strong>{submitState.status}</strong>
                  </div>
                </div>
              </div>
            ) : null}

            {submitState.kind === "error" ? <Alert type="error">{submitState.message}</Alert> : null}
          </form>
        </section>

        <aside className="public-side-column">
          <Card className="public-side-card">
            <h3>Ablauf</h3>
            <ol className="public-checklist">
              <li>Daten der besuchenden Person erfassen</li>
              <li>Ansprechpartner und Zeitraum festlegen</li>
              <li>Voranmeldung absenden</li>
              <li>Wache ergaenzt Pflichtdaten beim Check-in</li>
            </ol>
          </Card>

          <Card className="public-side-card">
            <h3>Hinweise</h3>
            <div className="public-meta-list">
              <span><strong>Pflichtfelder:</strong> alle mit *</span>
              <span><strong>Aktive Wachen:</strong> {activeGateCount || "-"}</span>
              <span><strong>Speicherung:</strong> direkt im lokalen System</span>
            </div>
          </Card>
        </aside>
      </main>
    </AppLayout>
  );
}
