import { useEffect, useState, type FormEvent } from "react";
import { ImportReviewModal } from "../components/ImportReviewModal";
import { NormalVisitorImportSection } from "../components/import/NormalVisitorImportSection";
import { Alert, FieldLabel, FormField } from "../components/ui";
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
  visitorStreet: string;
  visitorHouseNumber: string;
  visitorPostalCode: string;
  visitorCity: string;
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
  visitorStreet: "",
  visitorHouseNumber: "",
  visitorPostalCode: "",
  visitorCity: "",
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
      setFieldErrors(extractFieldErrors(apiError) as FieldErrorState);
      setGroupSubmitState({ kind: "error", message: apiError.message || "Der Gruppenimport konnte nicht gespeichert werden." });
    } finally {
      setIsSubmittingGroup(false);
    }
  }

  const documentExpired = isPastDate(form.idDocumentValidUntil);
  const defaultRequiredFields = new Set([
    "visitor_first_name", "visitor_last_name", "visitor_company", "visitor_nationality",
    "host_name", "host_phone", "visit_purpose", "valid_from", "valid_until"
  ]);
  const shown = (fieldKey: string) => publicFields === null || publicFields.some((field) => field.fieldKey === fieldKey);
  const required = (fieldKey: string) => publicFields === null
    ? defaultRequiredFields.has(fieldKey)
    : Boolean(publicFields.find((field) => field.fieldKey === fieldKey)?.requiredPublic);

  return (
    <AppLayout>
      <main className="page-panel page-shell-full public-pre-registration-shell">
        <section className="panel public-form-panel public-shared-details">
          <div className="public-form-intro">
            <div>
              <p className="eyebrow">Voranmeldung</p>
              <h2>Besuch anmelden</h2>
              <p className="section-copy">Bitte erfassen Sie zuerst die Besuchsdaten. Danach folgen die Angaben zum Besucher.</p>
            </div>
            <span className="required-hint"><span aria-hidden="true">*</span> Pflichtfeld</span>
          </div>
          <form className="pre-registration-form public-registration-form" onSubmit={handleSubmit}>
            <section className="public-form-section" aria-labelledby="visit-section-title">
            <div className="section-header compact-section-header"><div><h3 id="visit-section-title">Besuch</h3></div></div>
            <div className="form-grid two-columns">
            <FormField label="Wache" required error={fieldErrors.gateId}>
              <select required value={form.gateId} onChange={(event) => updateField("gateId", event.target.value)} disabled={gates.length === 0}>
                <option value="">Wache auswählen</option>
                {gates.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}
              </select>
            </FormField>
            {shown("host_name") ? <FormField label="Ansprechpartner" required={required("host_name")} error={fieldErrors.hostName}>
              <input required={required("host_name")} value={form.hostName} onChange={(event) => updateField("hostName", event.target.value)} />
            </FormField> : null}
            {shown("host_phone") ? <FormField label="Ansprechpartner Telefon" required={required("host_phone")} error={fieldErrors.hostPhone}>
              <input required={required("host_phone")} value={form.hostPhone} onChange={(event) => updateField("hostPhone", event.target.value)} />
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
              <FormField label="Voraussichtliche Ankunftszeit" error={fieldErrors.expectedArrivalTime}>
                <input type="time" value={form.expectedArrivalTime} onChange={(event) => updateField("expectedArrivalTime", event.target.value)} />
              </FormField>
            </div>
            </section>
            <section className="public-form-section" aria-labelledby="registrant-section-title">
            <div className="section-header compact-section-header"><div><h3 id="registrant-section-title">Anmelder</h3></div></div>
            <div className="form-grid two-columns">
              {shown("host_email") ? <FormField label="Anmelder-E-Mail" required={required("host_email")} error={fieldErrors.hostEmail}>
                <input required={required("host_email")} type="email" value={form.hostEmail} onChange={(event) => updateField("hostEmail", event.target.value)} />
              </FormField> : null}
              {shown("host_department") ? <FormField label="Geschäftsfeld" required={required("host_department")} error={fieldErrors.hostDepartment}>
                <input required={required("host_department")} value={form.hostDepartment} onChange={(event) => updateField("hostDepartment", event.target.value)} />
              </FormField> : null}
            </div>
            {shown("visit_note") ? <FormField label="Bemerkung" required={required("visit_note")} error={fieldErrors.notes}>
              <textarea required={required("visit_note")} rows={3} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
            </FormField> : null}
            </section>
            <section className="public-form-section" aria-labelledby="visitor-section-title">
            <div className="section-header compact-section-header">
              <div>
                <h3 id="visitor-section-title">Besucher</h3>
              </div>
            </div>

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
                  {shown("visitor_street") ? <FormField label="Straße" required={required("visitor_street")} error={fieldErrors.visitorStreet}>
                    <input required={required("visitor_street")} value={form.visitorStreet} onChange={(event) => updateField("visitorStreet", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_house_number") ? <FormField label="Hausnummer" required={required("visitor_house_number")} error={fieldErrors.visitorHouseNumber}>
                    <input required={required("visitor_house_number")} value={form.visitorHouseNumber} onChange={(event) => updateField("visitorHouseNumber", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_postal_code") ? <FormField label="PLZ" required={required("visitor_postal_code")} error={fieldErrors.visitorPostalCode}>
                    <input required={required("visitor_postal_code")} value={form.visitorPostalCode} onChange={(event) => updateField("visitorPostalCode", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_city") ? <FormField label="Ort" required={required("visitor_city")} error={fieldErrors.visitorCity}>
                    <input required={required("visitor_city")} value={form.visitorCity} onChange={(event) => updateField("visitorCity", event.target.value)} />
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

              <div className="form-actions public-action-bar">
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
            </section>
          </form>
        </section>

        <section className="public-entry-grid public-group-entry-grid">
          <section className="panel public-form-panel group-registration-panel">
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
                        {shown("visitor_first_name") ? <th><FieldLabel label="Vorname" required={required("visitor_first_name")} /></th> : null}
                        {shown("visitor_last_name") ? <th><FieldLabel label="Nachname" required={required("visitor_last_name")} /></th> : null}
                        {shown("visitor_company") ? <th><FieldLabel label="Firma" required={required("visitor_company")} /></th> : null}
                        {shown("visitor_nationality") ? <th><FieldLabel label="Nationalität" required={required("visitor_nationality")} /></th> : null}
                        {shown("visitor_birth_date") ? <th><FieldLabel label="Geburtsdatum" required={required("visitor_birth_date")} /></th> : null}
                        {shown("visitor_street") ? <th><FieldLabel label="Straße" required={required("visitor_street")} /></th> : null}
                        {shown("visitor_house_number") ? <th><FieldLabel label="Hausnummer" required={required("visitor_house_number")} /></th> : null}
                        {shown("visitor_postal_code") ? <th><FieldLabel label="PLZ" required={required("visitor_postal_code")} /></th> : null}
                        {shown("visitor_city") ? <th><FieldLabel label="Ort" required={required("visitor_city")} /></th> : null}
                        {shown("visitor_phone") ? <th><FieldLabel label="Telefon" required={required("visitor_phone")} /></th> : null}
                        {shown("visitor_email") ? <th><FieldLabel label="E-Mail" required={required("visitor_email")} /></th> : null}
                        {shown("id_document_type") ? <th><FieldLabel label="Ausweisart" required={required("id_document_type")} /></th> : null}
                        {shown("id_document_valid_until") ? <th><FieldLabel label="Ausweis gültig bis" required={required("id_document_valid_until")} /></th> : null}
                        {shown("id_document_number") ? <th className="group-id-document-number-column"><FieldLabel label="Ausweisnummer" required={required("id_document_number")} /></th> : null}
                        {shown("visitor_license_plate") ? <th className="group-license-plate-column"><FieldLabel label="Kennzeichen" required={required("visitor_license_plate")} /></th> : null}
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupVisitors.map((visitor, index) => (
                        <tr key={index}>
                          {shown("visitor_first_name") ? <td><input required={hasGroupVisitorData(visitor) && required("visitor_first_name")} value={visitor.firstName} onChange={(event) => updateGroupVisitor(index, "firstName", event.target.value)} /></td> : null}
                          {shown("visitor_last_name") ? <td><input required={hasGroupVisitorData(visitor) && required("visitor_last_name")} value={visitor.lastName} onChange={(event) => updateGroupVisitor(index, "lastName", event.target.value)} /></td> : null}
                          {shown("visitor_company") ? <td><input required={hasGroupVisitorData(visitor) && required("visitor_company")} value={visitor.company} onChange={(event) => updateGroupVisitor(index, "company", event.target.value)} /></td> : null}
                          {shown("visitor_nationality") ? <td><CountrySelect required={hasGroupVisitorData(visitor) && required("visitor_nationality")} value={visitor.nationalityCode} onChange={(value) => updateGroupVisitor(index, "nationalityCode", value)} /></td> : null}
                          {shown("visitor_birth_date") ? <td><input required={hasGroupVisitorData(visitor) && required("visitor_birth_date")} type="date" max={toDateInputValue(new Date())} value={visitor.birthDate} onChange={(event) => updateGroupVisitor(index, "birthDate", event.target.value)} /></td> : null}
                          {shown("visitor_street") ? <td><input required={hasGroupVisitorData(visitor) && required("visitor_street")} value={visitor.visitorStreet} onChange={(event) => updateGroupVisitor(index, "visitorStreet", event.target.value)} /></td> : null}
                          {shown("visitor_house_number") ? <td><input required={hasGroupVisitorData(visitor) && required("visitor_house_number")} value={visitor.visitorHouseNumber} onChange={(event) => updateGroupVisitor(index, "visitorHouseNumber", event.target.value)} /></td> : null}
                          {shown("visitor_postal_code") ? <td><input required={hasGroupVisitorData(visitor) && required("visitor_postal_code")} value={visitor.visitorPostalCode} onChange={(event) => updateGroupVisitor(index, "visitorPostalCode", event.target.value)} /></td> : null}
                          {shown("visitor_city") ? <td><input required={hasGroupVisitorData(visitor) && required("visitor_city")} value={visitor.visitorCity} onChange={(event) => updateGroupVisitor(index, "visitorCity", event.target.value)} /></td> : null}
                          {shown("visitor_phone") ? <td><input required={hasGroupVisitorData(visitor) && required("visitor_phone")} value={visitor.phone} onChange={(event) => updateGroupVisitor(index, "phone", event.target.value)} /></td> : null}
                          {shown("visitor_email") ? <td><input required={hasGroupVisitorData(visitor) && required("visitor_email")} type="email" value={visitor.email} onChange={(event) => updateGroupVisitor(index, "email", event.target.value)} /></td> : null}
                          {shown("id_document_type") ? <td>
                            <select required={hasGroupVisitorData(visitor) && required("id_document_type")} value={visitor.idDocumentType} onChange={(event) => updateGroupVisitor(index, "idDocumentType", event.target.value)}>
                              <option value="">-</option>
                              <option value="identity_card">Personalausweis</option>
                              <option value="passport">Reisepass</option>
                              <option value="service_id">Dienstausweis</option>
                              <option value="other">Sonstiges</option>
                            </select>
                          </td> : null}
                          {shown("id_document_valid_until") ? <td><input required={hasGroupVisitorData(visitor) && required("id_document_valid_until")} type="date" className={isPastDate(visitor.idDocumentValidUntil) ? "required-missing" : ""} title={isPastDate(visitor.idDocumentValidUntil) ? "Ausweisdokument ist abgelaufen." : undefined} value={visitor.idDocumentValidUntil} onChange={(event) => updateGroupVisitor(index, "idDocumentValidUntil", event.target.value)} /></td> : null}
                          {shown("id_document_number") ? <td className="group-id-document-number-column"><input required={hasGroupVisitorData(visitor) && required("id_document_number")} value={visitor.idDocumentNumber} onChange={(event) => updateGroupVisitor(index, "idDocumentNumber", event.target.value)} /></td> : null}
                          {shown("visitor_license_plate") ? <td className="group-license-plate-column"><input required={hasGroupVisitorData(visitor) && required("visitor_license_plate")} value={visitor.licensePlate} onChange={(event) => updateGroupVisitor(index, "licensePlate", event.target.value)} /></td> : null}
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

        <NormalVisitorImportSection publicMode csrfToken={csrfToken} />
      </main>
    </AppLayout>
  );
}
