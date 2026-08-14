import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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

type PageError = {
  message: string;
  requestId: string | null;
  reloadable: boolean;
};

const EDITABLE_FIELDS: Array<keyof EditState> = [
  "firstName", "lastName", "company", "phone", "email", "licensePlate", "purpose", "hostName", "hostPhone", "hostDepartment"
];

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

function editStatesMatch(left: EditState | null, right: EditState | null): boolean {
  if (!left || !right) return true;
  return EDITABLE_FIELDS.every((field) => (left[field] ?? "") === (right[field] ?? ""));
}

function toPageError(caught: unknown): PageError {
  const error = caught as ApiError;
  if (error?.error === "PUBLIC_CONFIRMATION_NOT_FOUND") {
    return { message: "Dieser Bestätigungslink ist ungültig.", requestId: error.requestId ?? null, reloadable: false };
  }
  if (error?.error === "PUBLIC_CONFIRMATION_EXPIRED") {
    return { message: "Dieser Bestätigungslink ist nicht mehr gültig.", requestId: error.requestId ?? null, reloadable: false };
  }
  if (error?.error === "PUBLIC_CONFIRMATION_REVOKED") {
    return { message: "Diese Voranmeldung wurde storniert, abgelehnt oder ist nicht mehr verfügbar.", requestId: error.requestId ?? null, reloadable: false };
  }
  if (error?.error === "PUBLIC_CONFIRMATION_CONFLICT") {
    return { message: "Die Voranmeldung wurde zwischenzeitlich geändert. Bitte laden Sie die aktuellen Daten neu.", requestId: error.requestId ?? null, reloadable: true };
  }
  if (error?.error === "PUBLIC_CONFIRMATION_NOT_EDITABLE") {
    return { message: "Ihre Voranmeldung kann nicht mehr geändert werden.", requestId: error.requestId ?? null, reloadable: true };
  }
  if (error?.error === "RATE_LIMITED") {
    return { message: "Es gab zu viele Versuche. Bitte warten Sie einen Moment und versuchen Sie es erneut.", requestId: error.requestId ?? null, reloadable: true };
  }
  if (!(caught && typeof caught === "object" && "error" in caught)) {
    return { message: "Die Verbindung zum Server konnte nicht hergestellt werden. Bitte versuchen Sie es erneut.", requestId: null, reloadable: true };
  }
  return {
    message: error.message || "Die Voranmeldung konnte nicht geladen werden.",
    requestId: error.requestId ?? null,
    reloadable: true
  };
}

function getFieldErrors(caught: unknown): Partial<Record<keyof EditState, string>> {
  const details = (caught as ApiError)?.details as { fieldErrors?: Record<string, string[]> } | undefined;
  const errors: Partial<Record<keyof EditState, string>> = {};
  for (const field of EDITABLE_FIELDS) {
    const message = details?.fieldErrors?.[field]?.[0];
    if (message) errors[field] = message;
  }
  return errors;
}

function publicStatusLabel(status: string): string {
  switch (status) {
    case "pre_registered":
      return "Voranmeldung erfasst";
    case "checked_in":
      return "Besucher eingecheckt";
    case "checked_out":
      return "Besuch abgeschlossen";
    case "cancelled":
      return "Voranmeldung storniert";
    case "rejected":
      return "Voranmeldung abgelehnt";
    default:
      return formatStatus(status);
  }
}

function editabilityCopy(detail: PublicPreRegistrationDetail): { title: string; reason: string | null } {
  if (detail.editable) {
    return {
      title: "Sie können Ihre Angaben noch bis zum Beginn Ihres Besuchstags ändern.",
      reason: `Ab ${formatDateOnly(detail.validFrom)} ist die Bearbeitung nicht mehr möglich.`
    };
  }
  if (detail.status === "cancelled") {
    return { title: "Diese Voranmeldung kann nicht mehr geändert werden.", reason: "Die Voranmeldung wurde storniert." };
  }
  if (detail.status === "rejected") {
    return { title: "Diese Voranmeldung kann nicht mehr geändert werden.", reason: "Die Voranmeldung wurde abgelehnt." };
  }
  if (detail.status === "checked_in" || detail.status === "checked_out") {
    return { title: "Diese Voranmeldung kann nicht mehr geändert werden.", reason: "Der Besuch hat bereits begonnen." };
  }
  if (detail.editMessage?.includes("Beginn des Besuchstags")) {
    return { title: "Diese Voranmeldung kann nicht mehr geändert werden.", reason: "Der Bearbeitungszeitraum ist abgelaufen." };
  }
  return { title: "Diese Voranmeldung kann nicht mehr geändert werden.", reason: detail.editMessage };
}

function locationLabel(detail: PublicPreRegistrationDetail): string {
  return [detail.gateName, detail.gateLocation].filter(Boolean).join(" · ") || "–";
}

function DetailValue({ label, value, wide = false }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return <div className={wide ? "public-detail-wide" : undefined}><dt>{label}</dt><dd>{value?.trim() || "–"}</dd></div>;
}

export function PublicPreRegistrationConfirmationPage() {
  const location = useLocation();
  const token = useMemo(() => location.hash.replace(/^#/, "").trim(), [location.hash]);
  const [detail, setDetail] = useState<PublicPreRegistrationDetail | null>(null);
  const [form, setForm] = useState<EditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState<PageError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof EditState, string>>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const firstEditFieldRef = useRef<HTMLInputElement>(null);
  const baseline = useMemo(() => detail ? toEditState(detail) : null, [detail]);
  const dirty = editing && !editStatesMatch(form, baseline);

  async function loadDetail() {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setDetail(null);
    setForm(null);
    setEditing(false);
    setSaving(false);
    setPageError(null);
    setFieldErrors({});
    setSuccess(null);
    if (!token) {
      setPageError({ message: "Dieser Bestätigungslink ist ungültig.", requestId: null, reloadable: false });
      setLoading(false);
      return;
    }
    try {
      const payload = await fetchJson<{ preRegistration: PublicPreRegistrationDetail }>("/api/public/pre-registration-confirmation", {
        method: "GET",
        headers: { "X-Confirmation-Token": token }
      });
      if (sequence !== loadSequence.current) return;
      setDetail(payload.preRegistration);
      setForm(toEditState(payload.preRegistration));
    } catch (caught) {
      if (sequence !== loadSequence.current) return;
      setPageError(toPageError(caught));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
  }, [token]);

  useEffect(() => {
    if (editing) firstEditFieldRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  function updateField(field: keyof EditState, value: string) {
    setForm((current) => current ? { ...current, [field]: value } : current);
    setFieldErrors((current) => current[field] ? { ...current, [field]: undefined } : current);
  }

  function beginEditing() {
    if (!detail?.editable) return;
    setForm(toEditState(detail));
    setFieldErrors({});
    setPageError(null);
    setSuccess(null);
    setEditing(true);
  }

  function cancelEditing() {
    if (!detail) return;
    if (dirty && !window.confirm("Ihre Änderungen wurden noch nicht gespeichert. Möchten Sie sie verwerfen?")) return;
    setForm(toEditState(detail));
    setFieldErrors({});
    setPageError(null);
    setEditing(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !form || saving) return;
    setSaving(true);
    setPageError(null);
    setFieldErrors({});
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
      setFieldErrors(getFieldErrors(caught));
      setPageError(toPageError(caught));
    } finally {
      setSaving(false);
    }
  }

  const editability = detail ? editabilityCopy(detail) : null;

  return (
    <main className="public-confirmation-page">
      <section className="public-confirmation-card" aria-labelledby="confirmation-title">
        <header className="public-confirmation-header">
          <img src={BRANDING.logo} alt="WIWeB" />
          <div>
            <p className="eyebrow">Besucher Manager</p>
            <h1 id="confirmation-title">Voranmeldung für Ihren Besuch</h1>
            <p className="public-confirmation-intro">Hier sehen Sie die aktuell gespeicherten Angaben zu Ihrer Voranmeldung.</p>
          </div>
        </header>

        {loading ? (
          <div className="public-confirmation-loading" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <p>Ihre Voranmeldung wird geladen …</p>
          </div>
        ) : null}

        {pageError ? (
          <div className="public-confirmation-feedback" role="alert">
            <Alert type="error">
              <p>{pageError.message}</p>
              {pageError.requestId ? <small>Support-Referenz: {pageError.requestId}</small> : null}
              {pageError.reloadable ? <button type="button" className="secondary-button" onClick={() => void loadDetail()}>Neu laden</button> : null}
            </Alert>
          </div>
        ) : null}

        {success ? (
          <div className="public-confirmation-feedback" role="status" aria-live="polite">
            <Alert type="success"><strong>{success}</strong></Alert>
          </div>
        ) : null}

        {!loading && detail && form ? (
          <>
            <section className="public-confirmation-overview" aria-label="Besuch im Überblick">
              <div><span>Besuchsdatum</span><strong>{formatDateOnly(detail.validFrom)}</strong></div>
              <div><span>Standort</span><strong>{locationLabel(detail)}</strong></div>
              <div><span>Status</span><strong className={`badge ${detail.status}`}>{publicStatusLabel(detail.status)}</strong></div>
            </section>

            <section className={`public-editability ${detail.editable ? "is-editable" : "is-locked"}`} aria-labelledby="editability-title">
              <div aria-hidden="true" className="public-editability-icon">{detail.editable ? "✓" : "🔒"}</div>
              <div>
                <h2 id="editability-title">{editability?.title}</h2>
                {editability?.reason ? <p>{editability.reason}</p> : null}
              </div>
            </section>

            {!editing ? (
              <>
                <div className="public-detail-sections">
                  <section aria-labelledby="visitor-details-title">
                    <h2 id="visitor-details-title">Besucher</h2>
                    <dl className="public-detail-grid">
                      <DetailValue label="Vorname" value={detail.firstName} />
                      <DetailValue label="Nachname" value={detail.lastName} />
                      <DetailValue label="Firma" value={detail.company} wide />
                      <DetailValue label="Telefonnummer" value={detail.phone} />
                      <DetailValue label="E-Mail" value={detail.email} />
                    </dl>
                  </section>

                  <section aria-labelledby="visit-details-title">
                    <h2 id="visit-details-title">Besuch</h2>
                    <dl className="public-detail-grid">
                      <DetailValue label="Besuchstag" value={formatDateOnly(detail.validFrom)} />
                      <DetailValue label="Erwartete Ankunftszeit" value={detail.expectedArrivalTime} />
                      <DetailValue label="Standort / Wache" value={locationLabel(detail)} wide />
                      <DetailValue label="Kennzeichen" value={detail.licensePlate} />
                      <DetailValue label="Besuchsgrund" value={detail.purpose} wide />
                    </dl>
                  </section>

                  <section aria-labelledby="host-details-title">
                    <h2 id="host-details-title">Ansprechpartner</h2>
                    <dl className="public-detail-grid">
                      <DetailValue label="Ansprechpartner" value={detail.hostName} />
                      <DetailValue label="Telefonnummer Ansprechpartner" value={detail.hostPhone} />
                      <DetailValue label="Geschäftsfeld" value={detail.hostDepartment} wide />
                    </dl>
                  </section>
                </div>

                {detail.recipientUpdatedAt ? <p className="public-last-updated">Zuletzt von Ihnen aktualisiert: {formatDateTime(detail.recipientUpdatedAt)} Uhr</p> : null}
                {detail.editable ? (
                  <div className="public-confirmation-actions">
                    <button type="button" className="primary-button" onClick={beginEditing}>Angaben bearbeiten</button>
                  </div>
                ) : null}
              </>
            ) : (
              <form className="public-confirmation-form" onSubmit={save} noValidate aria-busy={saving}>
                <section className="public-fixed-details" aria-labelledby="fixed-details-title">
                  <h2 id="fixed-details-title">Festgelegte Besuchsdaten</h2>
                  <p>Diese Angaben können über den Bestätigungslink nicht geändert werden.</p>
                  <dl className="public-detail-grid">
                    <DetailValue label="Besuchstag" value={formatDateOnly(detail.validFrom)} />
                    <DetailValue label="Erwartete Ankunftszeit" value={detail.expectedArrivalTime} />
                    <DetailValue label="Standort / Wache" value={locationLabel(detail)} />
                    <DetailValue label="Status" value={publicStatusLabel(detail.status)} />
                  </dl>
                </section>

                <div className="public-editable-details">
                  <div className="public-form-heading">
                    <h2>Änderbare Angaben</h2>
                    <p>Alle folgenden Felder sind optional. Leere Felder können gespeichert werden.</p>
                  </div>

                  <fieldset>
                    <legend>Besucher</legend>
                    <div className="public-confirmation-form-grid">
                      <FormField label="Vorname" error={fieldErrors.firstName} errorId="firstName-error"><input ref={firstEditFieldRef} autoComplete="given-name" aria-invalid={Boolean(fieldErrors.firstName)} aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined} value={form.firstName ?? ""} onChange={(event) => updateField("firstName", event.target.value)} /></FormField>
                      <FormField label="Nachname" error={fieldErrors.lastName} errorId="lastName-error"><input autoComplete="family-name" aria-invalid={Boolean(fieldErrors.lastName)} aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined} value={form.lastName ?? ""} onChange={(event) => updateField("lastName", event.target.value)} /></FormField>
                      <FormField label="Firma" error={fieldErrors.company} errorId="company-error"><input autoComplete="organization" aria-invalid={Boolean(fieldErrors.company)} aria-describedby={fieldErrors.company ? "company-error" : undefined} value={form.company ?? ""} onChange={(event) => updateField("company", event.target.value)} /></FormField>
                      <FormField label="Telefonnummer" error={fieldErrors.phone} errorId="phone-error"><input type="tel" inputMode="tel" autoComplete="tel" aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? "phone-error" : undefined} value={form.phone ?? ""} onChange={(event) => updateField("phone", event.target.value)} /></FormField>
                      <FormField label="E-Mail" error={fieldErrors.email} errorId="email-error"><input type="email" inputMode="email" autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} value={form.email ?? ""} onChange={(event) => updateField("email", event.target.value)} /></FormField>
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend>Besuch</legend>
                    <div className="public-confirmation-form-grid">
                      <FormField label="Kennzeichen" error={fieldErrors.licensePlate} errorId="licensePlate-error"><input aria-invalid={Boolean(fieldErrors.licensePlate)} aria-describedby={fieldErrors.licensePlate ? "licensePlate-error" : undefined} value={form.licensePlate ?? ""} onChange={(event) => updateField("licensePlate", event.target.value)} /></FormField>
                      <FormField label="Besuchsgrund" error={fieldErrors.purpose} errorId="purpose-error"><textarea rows={4} aria-invalid={Boolean(fieldErrors.purpose)} aria-describedby={fieldErrors.purpose ? "purpose-error" : undefined} value={form.purpose ?? ""} onChange={(event) => updateField("purpose", event.target.value)} /></FormField>
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend>Ansprechpartner</legend>
                    <div className="public-confirmation-form-grid">
                      <FormField label="Ansprechpartner" error={fieldErrors.hostName} errorId="hostName-error"><input aria-invalid={Boolean(fieldErrors.hostName)} aria-describedby={fieldErrors.hostName ? "hostName-error" : undefined} value={form.hostName ?? ""} onChange={(event) => updateField("hostName", event.target.value)} /></FormField>
                      <FormField label="Telefonnummer Ansprechpartner" error={fieldErrors.hostPhone} errorId="hostPhone-error"><input type="tel" inputMode="tel" aria-invalid={Boolean(fieldErrors.hostPhone)} aria-describedby={fieldErrors.hostPhone ? "hostPhone-error" : undefined} value={form.hostPhone ?? ""} onChange={(event) => updateField("hostPhone", event.target.value)} /></FormField>
                      <FormField label="Geschäftsfeld" error={fieldErrors.hostDepartment} errorId="hostDepartment-error"><input aria-invalid={Boolean(fieldErrors.hostDepartment)} aria-describedby={fieldErrors.hostDepartment ? "hostDepartment-error" : undefined} value={form.hostDepartment ?? ""} onChange={(event) => updateField("hostDepartment", event.target.value)} /></FormField>
                    </div>
                  </fieldset>
                </div>

                <div className="public-confirmation-actions public-edit-actions">
                  <button type="submit" className="primary-button" disabled={saving || !dirty}>{saving ? "Änderungen werden gespeichert …" : "Änderungen speichern"}</button>
                  <button type="button" className="secondary-button" disabled={saving} onClick={cancelEditing}>Abbrechen</button>
                </div>
              </form>
            )}

            <aside className="public-visit-hint" aria-labelledby="visit-hint-title">
              <h2 id="visit-hint-title">Für Ihren Besuch</h2>
              <ul>
                <li>Bitte prüfen Sie Ihre Angaben vor dem Besuch.</li>
                <li>Halten Sie die Bestätigungs-E-Mail bei Bedarf bereit.</li>
                <li>Melden Sie sich am Besuchstag an der vorgesehenen Wache.</li>
              </ul>
            </aside>
          </>
        ) : null}
      </section>
    </main>
  );
}
