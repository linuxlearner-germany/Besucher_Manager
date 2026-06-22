import { useEffect, useState, type FormEvent } from "react";
import { Alert, FormField } from "../components/ui";
import {
  AppLayout,
  type ApiError,
  buildInitialFormState,
  extractFieldErrors,
  fetchJson,
  type FieldErrorState,
  type FormState,
  type Gate,
  toDateInputValue
} from "../app/core";

type PublicSubmitState =
  | { kind: "idle" }
  | { kind: "success"; message: string; visitId: string; visitorId: string; status: string }
  | { kind: "error"; message: string };
type GroupVisitorForm = {
  firstName: string;
  lastName: string;
  company: string;
  birthDate: string;
  phone: string;
  email: string;
  licensePlate: string;
  idDocumentType: "identity_card" | "passport" | "other" | "";
  idDocumentValidUntil: string;
  idDocumentNumber: string;
};
type GroupImportResult = {
  imported: number;
  needsReview: number;
  rows: Array<{
    rowNumber: number;
    visitId: string;
    visitorName: string;
    company: string;
    missingFields: string[];
    warnings: string[];
    needsReview: boolean;
  }>;
  message: string;
};

const emptyGroupVisitor = (): GroupVisitorForm => ({
  firstName: "",
  lastName: "",
  company: "",
  birthDate: "",
  phone: "",
  email: "",
  licensePlate: "",
  idDocumentType: "",
  idDocumentValidUntil: "",
  idDocumentNumber: ""
});

function hasGroupVisitorData(visitor: GroupVisitorForm): boolean {
  return Object.values(visitor).some((value) => value.trim().length > 0);
}

function isPastDate(value: string): boolean {
  if (!value) return false;
  const date = new Date(`${value}T23:59:59.999Z`);
  return !Number.isNaN(date.getTime()) && date < new Date();
}

export function PublicPreRegistrationPage() {
  const [form, setForm] = useState<FormState>(() => buildInitialFormState());
  const [submitState, setSubmitState] = useState<PublicSubmitState>({ kind: "idle" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrorState>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingGroup, setIsSubmittingGroup] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [gates, setGates] = useState<Gate[]>([]);
  const [groupVisitors, setGroupVisitors] = useState<GroupVisitorForm[]>(() => [emptyGroupVisitor(), emptyGroupVisitor(), emptyGroupVisitor()]);
  const [groupResult, setGroupResult] = useState<GroupImportResult | null>(null);

  useEffect(() => {
    async function loadCsrf() {
      try {
        const payload = await fetchJson<{ csrfToken: string; gates: Array<{ id: string }> }>("/api/public/gates", { method: "GET", headers: {} });
        setCsrfToken(payload.csrfToken);
        setGates(payload.gates as Gate[]);
        setForm((current) => ({
          ...current,
          gateId: current.gateId || payload.gates[0]?.id || ""
        }));
      } catch {
        setCsrfToken("");
        setGates([]);
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
            ? "Die Sitzung für das Formular ist abgelaufen. Bitte Seite neu laden."
            : apiError.message || "Die Voranmeldung konnte nicht gespeichert werden."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateGroupVisitor(index: number, key: keyof GroupVisitorForm, value: string) {
    setGroupVisitors((current) => current.map((visitor, visitorIndex) => (
      visitorIndex === index ? { ...visitor, [key]: value } : visitor
    )));
  }

  async function handleGroupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const visitors = groupVisitors.filter(hasGroupVisitorData);
    if (visitors.length === 0) {
      setSubmitState({ kind: "error", message: "Bitte mindestens eine Besucherzeile ausfüllen." });
      return;
    }

    setIsSubmittingGroup(true);
    setSubmitState({ kind: "idle" });
    setGroupResult(null);

    try {
      const payload = await fetchJson<GroupImportResult>("/api/public/pre-registrations/group", {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({
          gateId: form.gateId,
          hostName: form.hostName,
          hostEmail: form.hostEmail,
          hostPhone: form.hostPhone,
          hostDepartment: form.hostDepartment,
          purpose: form.purpose,
          validFrom: form.validFrom,
          validUntil: form.validUntil,
          notes: form.notes,
          visitors
        })
      });
      setGroupResult(payload);
      setGroupVisitors([emptyGroupVisitor(), emptyGroupVisitor(), emptyGroupVisitor()]);
      setSubmitState({ kind: "success", message: payload.message, visitId: "-", visitorId: "-", status: "pre_registered" });
    } catch (error) {
      const apiError = error as ApiError;
      setSubmitState({ kind: "error", message: apiError.message || "Der Gruppenimport konnte nicht gespeichert werden." });
    } finally {
      setIsSubmittingGroup(false);
    }
  }

  const documentExpired = isPastDate(form.idDocumentValidUntil);

  return (
    <AppLayout>
      <main className="page-panel page-shell-full public-pre-registration-shell">
        <section className="panel public-form-panel">
          <div className="section-header">
            <div>
              <h2>Voranmeldung Besucher</h2>
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
                <FormField label="Ausweisart" required error={fieldErrors.idDocumentType}>
                  <select required value={form.idDocumentType} onChange={(event) => updateField("idDocumentType", event.target.value as FormState["idDocumentType"])}>
                    <option value="">Bitte wählen</option>
                    <option value="identity_card">Personalausweis</option>
                    <option value="passport">Reisepass</option>
                    <option value="other">Sonstiges</option>
                  </select>
                </FormField>
                <FormField label="Ausweis gültig bis" required error={fieldErrors.idDocumentValidUntil}>
                  <input required type="date" value={form.idDocumentValidUntil} onChange={(event) => updateField("idDocumentValidUntil", event.target.value)} />
                </FormField>
                <FormField label="Ausweisnummer" required error={fieldErrors.idDocumentNumber}>
                  <input required value={form.idDocumentNumber} onChange={(event) => updateField("idDocumentNumber", event.target.value)} />
                </FormField>
              </div>
              {documentExpired ? <Alert type="error">Das angegebene Ausweisdokument ist bereits abgelaufen.</Alert> : null}
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
                <FormField label="Gültig von" required error={fieldErrors.validFrom}>
                  <input required type="date" value={form.validFrom} onChange={(event) => updateField("validFrom", event.target.value)} />
                </FormField>
                <FormField label="Gültig bis" required error={fieldErrors.validUntil}>
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

          <form className="pre-registration-form group-pre-registration-form" onSubmit={handleGroupSubmit}>
            <div className="form-section">
              <div className="section-header">
                <div>
                  <h3>Gruppenimport</h3>
                </div>
                <button type="button" className="secondary-button" onClick={() => setGroupVisitors((current) => [...current, emptyGroupVisitor()])}>
                  Besucherzeile hinzufügen
                </button>
              </div>
              <div className="table-wrap">
                <table className="data-table group-import-table">
                  <thead>
                    <tr>
                      <th>Vorname</th>
                      <th>Nachname</th>
                      <th>Firma</th>
                      <th>Ausweisart</th>
                      <th>Ausweis gültig bis</th>
                      <th>Ausweisnummer</th>
                      <th>Kennzeichen</th>
                      <th>Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupVisitors.map((visitor, index) => (
                      <tr key={index}>
                        <td><input value={visitor.firstName} onChange={(event) => updateGroupVisitor(index, "firstName", event.target.value)} /></td>
                        <td><input value={visitor.lastName} onChange={(event) => updateGroupVisitor(index, "lastName", event.target.value)} /></td>
                        <td><input value={visitor.company} onChange={(event) => updateGroupVisitor(index, "company", event.target.value)} /></td>
                        <td>
                          <select value={visitor.idDocumentType} onChange={(event) => updateGroupVisitor(index, "idDocumentType", event.target.value)}>
                            <option value="">-</option>
                            <option value="identity_card">Personalausweis</option>
                            <option value="passport">Reisepass</option>
                            <option value="other">Sonstiges</option>
                          </select>
                        </td>
                        <td><input type="date" className={isPastDate(visitor.idDocumentValidUntil) ? "required-missing" : ""} value={visitor.idDocumentValidUntil} onChange={(event) => updateGroupVisitor(index, "idDocumentValidUntil", event.target.value)} /></td>
                        <td><input value={visitor.idDocumentNumber} onChange={(event) => updateGroupVisitor(index, "idDocumentNumber", event.target.value)} /></td>
                        <td><input value={visitor.licensePlate} onChange={(event) => updateGroupVisitor(index, "licensePlate", event.target.value)} /></td>
                        <td>
                          <button type="button" className="secondary-button" onClick={() => setGroupVisitors((current) => current.filter((_, visitorIndex) => visitorIndex !== index))}>
                            Entfernen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" disabled={isSubmittingGroup || !csrfToken}>
                {isSubmittingGroup ? "Importiert..." : "Gruppe voranmelden"}
              </button>
            </div>
          </form>
        </section>

        {groupResult && groupResult.needsReview > 0 ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card panel">
              <h3>Nachbearbeitung erforderlich</h3>
              <p className="section-copy">{groupResult.needsReview} von {groupResult.imported} Voranmeldungen haben fehlende Angaben oder Warnungen.</p>
              <ul className="text-list">
                {groupResult.rows.filter((row) => row.needsReview).map((row) => (
                  <li key={row.visitId}>
                    <strong>{row.visitorName}</strong>: {[...row.missingFields, ...row.warnings].join(" ")}
                  </li>
                ))}
              </ul>
              <div className="row-actions">
                <button type="button" onClick={() => setGroupResult(null)}>Schließen</button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </AppLayout>
  );
}
