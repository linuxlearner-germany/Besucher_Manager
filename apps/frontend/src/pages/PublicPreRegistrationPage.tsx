import { useEffect, useState, type FormEvent } from "react";
import { ImportReviewModal } from "../components/ImportReviewModal";
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
  nationalityCode: "",
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
    const populatedVisitors = groupVisitors.filter(hasGroupVisitorData);
    const visitors = populatedVisitors.length > 0 ? populatedVisitors : [emptyGroupVisitor()];

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
  const shown = (fieldKey: string) => publicFields === null || publicFields.some((field) => field.fieldKey === fieldKey);

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
            <span className="required-hint">Alle Angaben sind optional</span>
          </div>
          <form className="pre-registration-form public-registration-form" onSubmit={handleSubmit} noValidate>
            <section className="public-form-section" aria-labelledby="visit-section-title">
            <div className="section-header compact-section-header"><div><h3 id="visit-section-title">Besuch</h3></div></div>
            <div className="form-grid two-columns">
            <FormField label="Wache" error={fieldErrors.gateId}>
              <select value={form.gateId} onChange={(event) => updateField("gateId", event.target.value)} disabled={gates.length === 0}>
                <option value="">Wache auswählen</option>
                {gates.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}
              </select>
            </FormField>
            {shown("host_name") ? <FormField label="Ansprechpartner" error={fieldErrors.hostName}>
              <input value={form.hostName} onChange={(event) => updateField("hostName", event.target.value)} />
            </FormField> : null}
            {shown("host_phone") ? <FormField label="Ansprechpartner Telefon" error={fieldErrors.hostPhone}>
              <input value={form.hostPhone} onChange={(event) => updateField("hostPhone", event.target.value)} />
            </FormField> : null}
            {shown("visit_purpose") ? <FormField label="Besuchszweck" error={fieldErrors.purpose}>
              <input value={form.purpose} onChange={(event) => updateField("purpose", event.target.value)} />
            </FormField> : null}
            {shown("valid_from") ? <FormField label="Gültig von" error={fieldErrors.validFrom}>
              <input type="date" value={form.validFrom} onChange={(event) => updateField("validFrom", event.target.value)} />
            </FormField> : null}
            {shown("valid_until") ? <FormField label="Gültig bis" error={fieldErrors.validUntil}>
              <input type="date" value={form.validUntil} onChange={(event) => updateField("validUntil", event.target.value)} />
            </FormField> : null}
              <FormField label="Voraussichtliche Ankunftszeit" error={fieldErrors.expectedArrivalTime}>
                <input type="time" value={form.expectedArrivalTime} onChange={(event) => updateField("expectedArrivalTime", event.target.value)} />
              </FormField>
            </div>
            </section>
            <section className="public-form-section" aria-labelledby="registrant-section-title">
            <div className="section-header compact-section-header"><div><h3 id="registrant-section-title">Anmelder</h3></div></div>
            <div className="form-grid two-columns">
              {shown("host_email") ? <FormField label="Anmelder-E-Mail" error={fieldErrors.hostEmail}>
                <input type="email" value={form.hostEmail} onChange={(event) => updateField("hostEmail", event.target.value)} />
              </FormField> : null}
              {shown("host_department") ? <FormField label="Geschäftsfeld" error={fieldErrors.hostDepartment}>
                <input value={form.hostDepartment} onChange={(event) => updateField("hostDepartment", event.target.value)} />
              </FormField> : null}
            </div>
            {shown("visit_note") ? <FormField label="Bemerkung" error={fieldErrors.notes}>
              <textarea rows={3} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
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
                  {shown("visitor_first_name") ? <FormField label="Vorname" error={fieldErrors.firstName}>
                    <input value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_last_name") ? <FormField label="Nachname" error={fieldErrors.lastName}>
                    <input value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_company") ? <FormField label="Firma / Organisation" error={fieldErrors.company}>
                    <input value={form.company} onChange={(event) => updateField("company", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_street") ? <FormField label="Straße" error={fieldErrors.visitorStreet}>
                    <input value={form.visitorStreet} onChange={(event) => updateField("visitorStreet", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_house_number") ? <FormField label="Hausnummer" error={fieldErrors.visitorHouseNumber}>
                    <input value={form.visitorHouseNumber} onChange={(event) => updateField("visitorHouseNumber", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_postal_code") ? <FormField label="PLZ" error={fieldErrors.visitorPostalCode}>
                    <input value={form.visitorPostalCode} onChange={(event) => updateField("visitorPostalCode", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_city") ? <FormField label="Ort" error={fieldErrors.visitorCity}>
                    <input value={form.visitorCity} onChange={(event) => updateField("visitorCity", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_nationality") ? <FormField label="Nationalität" error={fieldErrors.nationalityCode}>
                    <CountrySelect value={form.nationalityCode} onChange={(value) => updateField("nationalityCode", value)} />
                  </FormField> : null}
                  {shown("visitor_birth_date") ? <FormField label="Geburtsdatum" error={fieldErrors.birthDate}>
                    <input type="date" max={toDateInputValue(new Date())} value={form.birthDate} onChange={(event) => updateField("birthDate", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_phone") ? <FormField label="Telefonnummer">
                    <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_email") ? <FormField label="E-Mail-Adresse">
                    <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
                  </FormField> : null}
                  {shown("visitor_license_plate") ? <FormField label="Kennzeichen">
                    <input value={form.licensePlate} onChange={(event) => updateField("licensePlate", event.target.value)} />
                  </FormField> : null}
                  {shown("id_document_type") ? <FormField label="Ausweisart" error={fieldErrors.idDocumentType}>
                    <select value={form.idDocumentType} onChange={(event) => updateField("idDocumentType", event.target.value as FormState["idDocumentType"])}>
                      <option value="">Bitte wählen</option>
                      <option value="identity_card">Personalausweis</option>
                      <option value="passport">Reisepass</option>
                      <option value="service_id">Dienstausweis</option>
                      <option value="other">Sonstiges</option>
                    </select>
                  </FormField> : null}
                  {shown("id_document_valid_until") ? <FormField label="Ausweis gültig bis" error={fieldErrors.idDocumentValidUntil}>
                    <input type="date" value={form.idDocumentValidUntil} onChange={(event) => updateField("idDocumentValidUntil", event.target.value)} />
                  </FormField> : null}
                  {shown("id_document_number") ? <FormField label="Ausweisnummer" error={fieldErrors.idDocumentNumber}>
                    <input value={form.idDocumentNumber} onChange={(event) => updateField("idDocumentNumber", event.target.value)} />
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
            <form className="pre-registration-form group-pre-registration-form" onSubmit={handleGroupSubmit} noValidate>
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
                        {shown("visitor_first_name") ? <th><FieldLabel label="Vorname" /></th> : null}
                        {shown("visitor_last_name") ? <th><FieldLabel label="Nachname" /></th> : null}
                        {shown("visitor_company") ? <th><FieldLabel label="Firma" /></th> : null}
                        {shown("visitor_nationality") ? <th><FieldLabel label="Nationalität" /></th> : null}
                        {shown("visitor_birth_date") ? <th><FieldLabel label="Geburtsdatum" /></th> : null}
                        {shown("visitor_street") ? <th><FieldLabel label="Straße" /></th> : null}
                        {shown("visitor_house_number") ? <th><FieldLabel label="Hausnummer" /></th> : null}
                        {shown("visitor_postal_code") ? <th><FieldLabel label="PLZ" /></th> : null}
                        {shown("visitor_city") ? <th><FieldLabel label="Ort" /></th> : null}
                        {shown("visitor_phone") ? <th><FieldLabel label="Telefon" /></th> : null}
                        {shown("visitor_email") ? <th><FieldLabel label="E-Mail" /></th> : null}
                        {shown("id_document_type") ? <th><FieldLabel label="Ausweisart" /></th> : null}
                        {shown("id_document_valid_until") ? <th><FieldLabel label="Ausweis gültig bis" /></th> : null}
                        {shown("id_document_number") ? <th className="group-id-document-number-column"><FieldLabel label="Ausweisnummer" /></th> : null}
                        {shown("visitor_license_plate") ? <th className="group-license-plate-column"><FieldLabel label="Kennzeichen" /></th> : null}
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupVisitors.map((visitor, index) => (
                        <tr key={index}>
                          {shown("visitor_first_name") ? <td><input value={visitor.firstName} onChange={(event) => updateGroupVisitor(index, "firstName", event.target.value)} /></td> : null}
                          {shown("visitor_last_name") ? <td><input value={visitor.lastName} onChange={(event) => updateGroupVisitor(index, "lastName", event.target.value)} /></td> : null}
                          {shown("visitor_company") ? <td><input value={visitor.company} onChange={(event) => updateGroupVisitor(index, "company", event.target.value)} /></td> : null}
                          {shown("visitor_nationality") ? <td><CountrySelect value={visitor.nationalityCode} onChange={(value) => updateGroupVisitor(index, "nationalityCode", value)} /></td> : null}
                          {shown("visitor_birth_date") ? <td><input type="date" max={toDateInputValue(new Date())} value={visitor.birthDate} onChange={(event) => updateGroupVisitor(index, "birthDate", event.target.value)} /></td> : null}
                          {shown("visitor_street") ? <td><input value={visitor.visitorStreet} onChange={(event) => updateGroupVisitor(index, "visitorStreet", event.target.value)} /></td> : null}
                          {shown("visitor_house_number") ? <td><input value={visitor.visitorHouseNumber} onChange={(event) => updateGroupVisitor(index, "visitorHouseNumber", event.target.value)} /></td> : null}
                          {shown("visitor_postal_code") ? <td><input value={visitor.visitorPostalCode} onChange={(event) => updateGroupVisitor(index, "visitorPostalCode", event.target.value)} /></td> : null}
                          {shown("visitor_city") ? <td><input value={visitor.visitorCity} onChange={(event) => updateGroupVisitor(index, "visitorCity", event.target.value)} /></td> : null}
                          {shown("visitor_phone") ? <td><input value={visitor.phone} onChange={(event) => updateGroupVisitor(index, "phone", event.target.value)} /></td> : null}
                          {shown("visitor_email") ? <td><input type="email" value={visitor.email} onChange={(event) => updateGroupVisitor(index, "email", event.target.value)} /></td> : null}
                          {shown("id_document_type") ? <td>
                            <select value={visitor.idDocumentType} onChange={(event) => updateGroupVisitor(index, "idDocumentType", event.target.value)}>
                              <option value="">-</option>
                              <option value="identity_card">Personalausweis</option>
                              <option value="passport">Reisepass</option>
                              <option value="service_id">Dienstausweis</option>
                              <option value="other">Sonstiges</option>
                            </select>
                          </td> : null}
                          {shown("id_document_valid_until") ? <td><input type="date" className={isPastDate(visitor.idDocumentValidUntil) ? "required-missing" : ""} title={isPastDate(visitor.idDocumentValidUntil) ? "Ausweisdokument ist abgelaufen." : undefined} value={visitor.idDocumentValidUntil} onChange={(event) => updateGroupVisitor(index, "idDocumentValidUntil", event.target.value)} /></td> : null}
                          {shown("id_document_number") ? <td className="group-id-document-number-column"><input value={visitor.idDocumentNumber} onChange={(event) => updateGroupVisitor(index, "idDocumentNumber", event.target.value)} /></td> : null}
                          {shown("visitor_license_plate") ? <td className="group-license-plate-column"><input value={visitor.licensePlate} onChange={(event) => updateGroupVisitor(index, "licensePlate", event.target.value)} /></td> : null}
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
