import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { Alert, FormField } from "../components/ui";
import { BRANDING, type ApiError, fetchJson, formatDateOnly, formatDateTime, formatStatus } from "../app/core";

export type PublicPreRegistrationDetail = {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  licensePlate: string | null;
  purpose: string | null;
  hostName: string | null;
  hostPhone: string | null;
  hostDepartment: string | null;
  validFrom: string;
  validUntil: string;
  expectedArrivalTime: string | null;
  gateName: string | null;
  gateLocation: string | null;
  status: string;
  editable: boolean;
  editMessage: string | null;
  recipientUpdatedAt: string | null;
  version: string;
};

type EditState = Pick<PublicPreRegistrationDetail,
  "firstName" | "lastName" | "company" | "phone" | "email" | "licensePlate" | "purpose" | "hostName" | "hostPhone" | "hostDepartment"
>;

function toEditState(detail: PublicPreRegistrationDetail): EditState {
  return {
    firstName: detail.firstName ?? "",
    lastName: detail.lastName ?? "",
    company: detail.company ?? "",
    phone: detail.phone ?? "",
    email: detail.email ?? "",
    licensePlate: detail.licensePlate ?? "",
    purpose: detail.purpose ?? "",
    hostName: detail.hostName ?? "",
    hostPhone: detail.hostPhone ?? "",
    hostDepartment: detail.hostDepartment ?? ""
  };
}

function accessErrorMessage(error: ApiError): string {
  if (error.error === "PUBLIC_CONFIRMATION_NOT_FOUND") return "Dieser Bestätigungslink ist ungültig.";
  if (error.error === "PUBLIC_CONFIRMATION_EXPIRED") return "Dieser Bestätigungslink ist nicht mehr gültig.";
  if (error.error === "PUBLIC_CONFIRMATION_REVOKED") return "Diese Voranmeldung wurde widerrufen oder ist nicht mehr verfügbar.";
  if (error.error === "PUBLIC_CONFIRMATION_CONFLICT") return "Die Voranmeldung wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu.";
  if (error.error === "PUBLIC_CONFIRMATION_NOT_EDITABLE") return "Diese Voranmeldung kann nicht mehr geändert werden.";
  const reference = error.requestId ? ` Referenz: ${error.requestId}` : "";
  return `${error.message || "Die Voranmeldung konnte nicht geladen werden."}${reference}`;
}

function DetailValue({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt>{label}</dt><dd>{value?.trim() || "–"}</dd></div>;
}

export function PublicPreRegistrationConfirmationPage() {
  const location = useLocation();
  const token = useMemo(() => location.hash.replace(/^#/, "").trim(), [location.hash]);
  const [detail, setDetail] = useState<PublicPreRegistrationDetail | null>(null);
  const [form, setForm] = useState<EditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadDetail() {
    setLoading(true);
    setDetail(null);
    setForm(null);
    setEditing(false);
    setSuccess(null);
    if (!token) {
      setError("Dieser Bestätigungslink ist ungültig.");
      setLoading(false);
      return;
    }
    try {
      const payload = await fetchJson<{ preRegistration: PublicPreRegistrationDetail }>("/api/public/pre-registration-confirmation", {
        method: "GET",
        headers: { "X-Confirmation-Token": token }
      });
      setDetail(payload.preRegistration);
      setForm(toEditState(payload.preRegistration));
      setError(null);
    } catch (caught) {
      setError(accessErrorMessage(caught as ApiError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
  }, [token]);

  function updateField(field: keyof EditState, value: string) {
    setForm((current) => current ? { ...current, [field]: value } : current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !form) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = await fetchJson<{ message: string; preRegistration: PublicPreRegistrationDetail }>("/api/public/pre-registration-confirmation", {
        method: "PATCH",
        headers: { "X-Confirmation-Token": token },
        body: JSON.stringify({ version: detail.version, ...form })
      });
      setDetail(payload.preRegistration);
      setForm(toEditState(payload.preRegistration));
      setEditing(false);
      setSuccess(payload.message || "Ihre Änderungen wurden erfolgreich gespeichert.");
    } catch (caught) {
      setError(accessErrorMessage(caught as ApiError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="public-confirmation-page">
      <section className="public-confirmation-card" aria-labelledby="confirmation-title">
        <header className="public-confirmation-header">
          <img src={BRANDING.logo} alt="WIWeB" />
          <div><p className="eyebrow">Besucher Manager</p><h1 id="confirmation-title">Ihre Voranmeldung</h1></div>
        </header>

        {loading ? <p role="status">Voranmeldung wird geladen …</p> : null}
        {error ? <Alert type="error">{error}</Alert> : null}
        {success ? <Alert type="success">{success}</Alert> : null}

        {!loading && detail && form ? (
          <>
            <div className="public-confirmation-summary">
              <span className={`badge ${detail.status}`}>{formatStatus(detail.status)}</span>
              <p>Dieser Link zeigt ausschließlich die für Sie bestimmten Angaben dieser Voranmeldung.</p>
            </div>

            {!editing ? (
              <>
                <dl className="detail-grid public-confirmation-details">
                  <DetailValue label="Vorname" value={detail.firstName} />
                  <DetailValue label="Nachname" value={detail.lastName} />
                  <DetailValue label="Firma" value={detail.company} />
                  <DetailValue label="Besuchstag" value={formatDateOnly(detail.validFrom)} />
                  <DetailValue label="Erwartete Ankunft" value={detail.expectedArrivalTime} />
                  <DetailValue label="Gültig bis" value={formatDateOnly(detail.validUntil)} />
                  <DetailValue label="Ansprechpartner" value={detail.hostName} />
                  <DetailValue label="Geschäftsfeld" value={detail.hostDepartment} />
                  <DetailValue label="Standort" value={[detail.gateName, detail.gateLocation].filter(Boolean).join(" · ")} />
                  <DetailValue label="Kennzeichen" value={detail.licensePlate} />
                  <DetailValue label="Telefon Besucher" value={detail.phone} />
                  <DetailValue label="E-Mail Besucher" value={detail.email} />
                  <DetailValue label="Telefon Ansprechpartner" value={detail.hostPhone} />
                  <DetailValue label="Besuchsgrund" value={detail.purpose} />
                </dl>
                {detail.recipientUpdatedAt ? <p className="muted">Von Ihnen aktualisiert am {formatDateTime(detail.recipientUpdatedAt)}.</p> : null}
                {detail.editable ? <button type="button" className="primary-button" onClick={() => setEditing(true)}>Angaben bearbeiten</button> : <Alert type="info">{detail.editMessage || "Diese Voranmeldung kann nicht mehr geändert werden."}</Alert>}
              </>
            ) : (
              <form className="pre-registration-form public-confirmation-form" onSubmit={save}>
                <div className="form-grid">
                  <FormField label="Vorname"><input value={form.firstName ?? ""} onChange={(event) => updateField("firstName", event.target.value)} /></FormField>
                  <FormField label="Nachname"><input value={form.lastName ?? ""} onChange={(event) => updateField("lastName", event.target.value)} /></FormField>
                  <FormField label="Firma"><input value={form.company ?? ""} onChange={(event) => updateField("company", event.target.value)} /></FormField>
                  <FormField label="Telefon Besucher"><input value={form.phone ?? ""} onChange={(event) => updateField("phone", event.target.value)} /></FormField>
                  <FormField label="E-Mail Besucher"><input type="email" value={form.email ?? ""} onChange={(event) => updateField("email", event.target.value)} /></FormField>
                  <FormField label="Kennzeichen"><input value={form.licensePlate ?? ""} onChange={(event) => updateField("licensePlate", event.target.value)} /></FormField>
                  <FormField label="Ansprechpartner"><input value={form.hostName ?? ""} onChange={(event) => updateField("hostName", event.target.value)} /></FormField>
                  <FormField label="Telefon Ansprechpartner"><input value={form.hostPhone ?? ""} onChange={(event) => updateField("hostPhone", event.target.value)} /></FormField>
                  <FormField label="Geschäftsfeld"><input value={form.hostDepartment ?? ""} onChange={(event) => updateField("hostDepartment", event.target.value)} /></FormField>
                  <FormField label="Besuchsgrund"><textarea value={form.purpose ?? ""} onChange={(event) => updateField("purpose", event.target.value)} /></FormField>
                </div>
                <div className="button-row">
                  <button type="button" className="secondary-button" disabled={saving} onClick={() => { setForm(toEditState(detail)); setEditing(false); setError(null); }}>Abbrechen</button>
                  <button type="submit" className="primary-button" disabled={saving}>{saving ? "Speichert …" : "Änderungen speichern"}</button>
                </div>
              </form>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
