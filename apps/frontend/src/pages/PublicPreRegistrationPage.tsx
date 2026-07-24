import { useEffect, useState, type FormEvent } from "react";
import { ImportReviewModal } from "../components/ImportReviewModal";
import { Alert, FormField } from "../components/ui";
import { CountrySelect } from "../components/CountrySelect";
import {
  AppLayout,
  type AdminFieldDefinition,
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
  nationalityCode: string;
  birthDate: string;
  phone: string;
  email: string;
  licensePlate: string;
  idDocumentType: "identity_card" | "passport" | "service_id" | "other" | "";
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
  nationalityCode: "DE",
  birthDate: "",
  phone: "",
  email: "",
  licensePlate: "",
  idDocumentType: "",
  idDocumentValidUntil: "",
  idDocumentNumber: ""
});

function hasGroupVisitorData(visitor: GroupVisitorForm): boolean {
  return Object.entries(visitor).some(([key, value]) => key !== "nationalityCode" && value.trim().length > 0);
}

function isPastDate(value: string): boolean {
  if (!value) return false;
  const date = new Date(`${value}T23:59:59.999Z`);
  return !Number.isNaN(date.getTime()) && date < new Date();
}

export function PublicPreRegistrationPage() {
  const [form, setForm] = useState<FormState>(() => buildInitialFormState());
  const [submitState, setSubmitState] = useState<PublicSubmitState>({ kind: "idle" });
  const [groupSubmitState, setGroupSubmitState] = useState<PublicSubmitState>({ kind: "idle" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrorState>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingGroup, setIsSubmittingGroup] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [gates, setGates] = useState<Gate[]>([]);
  const [publicFields, setPublicFields] = useState<AdminFieldDefinition[] | null>(null);
  const [groupVisitors, setGroupVisitors] = useState<GroupVisitorForm[]>(() => [emptyGroupVisitor(), emptyGroupVisitor(), emptyGroupVisitor()]);
  const [groupResult, setGroupResult] = useState<GroupImportResult | null>(null);

  useEffect(() => {
    async function loadCsrf() {
      try {
        const [payload, fieldsPayload] = await Promise.all([
          fetchJson<{ csrfToken: string; gates: Array<{ id: string }> }>("/api/public/gates", { method: "GET", headers: {} }),
          fetchJson<{ definitions: AdminFieldDefinition[] }>("/api/field-definitions?context=public", { method: "GET", headers: {} })
        ]);
        setCsrfToken(payload.csrfToken);
        setGates(payload.gates as Gate[]);
        setPublicFields(fieldsPayload.definitions);
        setForm((current) => ({
          ...current,
          gateId: current.gateId || payload.gates[0]?.id || ""
        }));
      } catch {
        setCsrfToken("");
        setGates([]);
        setPublicFields(null);
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
      setGroupSubmitState({ kind: "error", message: "Bitte mindestens eine Besucherzeile ausfüllen." });
      return;
    }

    setIsSubmittingGroup(true);
    setGroupSubmitState({ kind: "idle" });
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
      setGroupSubmitState({ kind: "success", message: payload.message, visitId: "-", visitorId: "-", status: "pre_registered" });
    } catch (error) {
      const apiError = error as ApiError;
      setGroupSubmitState({ kind: "error", message: apiError.message || "Der Gruppenimport konnte nicht gespeichert werden." });
    } finally {
      setIsSubmittingGroup(false);
    }
  }

  const documentExpired = isPastDate(form.idDocumentValidUntil);
  const defaultRequiredFields = new Set([
    "visitor_first_name", "visitor_last_name", "visitor_company", "visitor_nationality",
    "host_name", "host_phone", "visit_purpose", "valid_from", "valid_until",
    "id_document_type", "id_document_valid_until", "id_document_number"
  ]);
  const shown = (fieldKey: string) => publicFields === null || publicFields.some((field) => field.fieldKey === fieldKey);
  const required = (fieldKey: string) => publicFields === null
    ? defaultRequiredFields.has(fieldKey)
    : Boolean(publicFields.find((field) => field.fieldKey === fieldKey)?.requiredPublic);

  return (
    <AppLayout>
      <main className="page-panel page-shell-full public-pre-registration-shell">
        <section className="panel public-form-panel">
          <div className="section-header">
            <div>
              <h3>Gemeinsame Besuchsdaten</h3>
            </div>
          </div>
          <div className="form-grid two-columns">
            {shown("host_name") ? <FormField label="Ansprechpartner" required={required("host_name")} error={fieldErrors.hostName}>
              <input required={required("host_name")} value={form.hostName} onChange={(event) => updateField("hostName", event.target.value)} />
            </FormField> : null}
            {shown("host_email") ? <FormField label="Ansprechpartner E-Mail" required={required("host_email")}>
              <input required={required("host_email")} type="email" value={form.hostEmail} onChange={(event) => updateField("hostEmail", event.target.value)} />
            </FormField> : null}
            {shown("host_phone") ? <FormField label="Ansprechpartner Telefon" required={required("host_phone")} error={fieldErrors.hostPhone}>
              <input required={required("host_phone")} value={form.hostPhone} onChange={(event) => updateField("hostPhone", event.target.value)} />
            </FormField> : null}
            {shown("host_department") ? <FormField label="Abteilung / Bereich" required={required("host_department")} error={fieldErrors.hostDepartment}>
              <input required={required("host_department")} value={form.hostDepartment} onChange={(event) => updateField("hostDepartment", event.target.value)} />
            </FormField> : null}
            {shown("visit_purpose") ? <FormField label="Besuchszweck" required={required("visit_purpose")} error={fieldErrors.purpose}>
              <input required={required("visit_purpose")} value={form.purpose} onChange={(event) => updateField("purpose", event.target.value)} />
            </FormField> : null}
            {shown("valid_from") ? <FormField label="Gültig von" required={required("valid_from")} error={fieldErrors.validFrom}>
              <input required={required("valid_from")} type="date" value={form.validFrom} onChange={(event) => updateField("validFrom", event.target.value)} />
            </FormField> : null}
            {shown("valid_until") ? <FormField label="Gültig bis" required={required("valid_until")} error={fieldErrors.validUntil}>
              <input required={required("valid_until")} type="date" value={form.validUntil} onChange={(event) => updateField("validUntil", event.target.value)} />
            </FormField> : null}
          </div>
          {shown("visit_note") ? <FormField label="Bemerkung" required={required("visit_note")}>
            <textarea required={required("visit_note")} rows={3} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
          </FormField> : null}
        </section>

        <section className="public-entry-grid">
          <section className="panel public-form-panel">
            <div className="section-header">
              <div>
                <h3>Einzelanmeldung</h3>
              </div>
            </div>

            <form className="pre-registration-form" onSubmit={handleSubmit}>
              <div className="form-section">
                <div className="form-grid two-columns">
                  {shown("visitor_first_name") ? <FormField label="Vorname" required={required("visitor_first_name")} error={fieldErrors.firstName}>
                    <input required={required("visitor_first_name")} value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_last_name") ? <FormField label="Nachname" required={required("visitor_last_name")} error={fieldErrors.lastName}>
                    <input required={required("visitor_last_name")} value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_company") ? <FormField label="Firma / Organisation" required={required("visitor_company")} error={fieldErrors.company}>
                    <input required={required("visitor_company")} value={form.company} onChange={(event) => updateField("company", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_nationality") ? <FormField label="Nationalität" required={required("visitor_nationality")} error={fieldErrors.nationalityCode}>
                    <CountrySelect required={required("visitor_nationality")} value={form.nationalityCode} onChange={(value) => updateField("nationalityCode", value)} />
                  </FormField> : null}
                  {shown("visitor_birth_date") ? <FormField label="Geburtsdatum" required={required("visitor_birth_date")} error={fieldErrors.birthDate}>
                    <input required={required("visitor_birth_date")} type="date" max={toDateInputValue(new Date())} value={form.birthDate} onChange={(event) => updateField("birthDate", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_phone") ? <FormField label="Telefonnummer" required={required("visitor_phone")}>
                    <input required={required("visitor_phone")} value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_email") ? <FormField label="E-Mail-Adresse" required={required("visitor_email")}>
                    <input required={required("visitor_email")} type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_license_plate") ? <FormField label="Kennzeichen" required={required("visitor_license_plate")}>
                    <input required={required("visitor_license_plate")} value={form.licensePlate} onChange={(event) => updateField("licensePlate", event.target.value)} />
                  </FormField> : null}
                  {shown("id_document_type") ? <FormField label="Ausweisart" required={required("id_document_type")} error={fieldErrors.idDocumentType}>
                    <select required={required("id_document_type")} value={form.idDocumentType} onChange={(event) => updateField("idDocumentType", event.target.value as FormState["idDocumentType"])}>
                      <option value="">Bitte wählen</option>
                      <option value="identity_card">Personalausweis</option>
                      <option value="passport">Reisepass</option>
                      <option value="service_id">Dienstausweis</option>
                      <option value="other">Sonstiges</option>
                    </select>
                  </FormField> : null}
                  {shown("id_document_valid_until") ? <FormField label="Ausweis gültig bis" required={required("id_document_valid_until")} error={fieldErrors.idDocumentValidUntil}>
                    <input required={required("id_document_valid_until")} type="date" value={form.idDocumentValidUntil} onChange={(event) => updateField("idDocumentValidUntil", event.target.value)} />
                  </FormField> : null}
                  {shown("id_document_number") ? <FormField label="Ausweisnummer" required={required("id_document_number")} error={fieldErrors.idDocumentNumber}>
                    <input required={required("id_document_number")} value={form.idDocumentNumber} onChange={(event) => updateField("idDocumentNumber", event.target.value)} />
                  </FormField> : null}
                </div>
                {documentExpired ? <Alert type="error">Das angegebene Ausweisdokument ist bereits abgelaufen.</Alert> : null}
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

          <section className="panel public-form-panel">
            <form className="pre-registration-form group-pre-registration-form" onSubmit={handleGroupSubmit}>
              <div className="form-section">
                <div className="section-header">
                  <div>
                    <h3>Gruppenanmeldung</h3>
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
                        <th>Nationalität</th>
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
                          <td><CountrySelect required value={visitor.nationalityCode} onChange={(value) => updateGroupVisitor(index, "nationalityCode", value)} /></td>
                          <td>
                            <select value={visitor.idDocumentType} onChange={(event) => updateGroupVisitor(index, "idDocumentType", event.target.value)}>
                              <option value="">-</option>
                              <option value="identity_card">Personalausweis</option>
                              <option value="passport">Reisepass</option>
                              <option value="service_id">Dienstausweis</option>
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

              {groupSubmitState.kind === "success" ? <Alert type="success">{groupSubmitState.message}</Alert> : null}
              {groupSubmitState.kind === "error" ? <Alert type="error">{groupSubmitState.message}</Alert> : null}
            </form>
          </section>
        </section>

        {groupResult && groupResult.needsReview > 0 ? (
          <ImportReviewModal
            rows={groupResult.rows}
            showLoginHint
            onClose={() => setGroupResult(null)}
          />
        ) : null}
      </main>
    </AppLayout>
  );
}
