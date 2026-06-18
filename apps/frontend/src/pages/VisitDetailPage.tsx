import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, FormField } from "../components/ui";
import {
  AppLayout,
  type ApiError,
  buildCheckoutStateFromVisit,
  buildGuardVisitEditState,
  buildInitialCheckoutState,
  extractFieldErrors,
  fetchJson,
  formatDateOnly,
  formatDateTime,
  formatStatus,
  type Gate,
  getNextStepHint,
  type GuardVisitEditState,
  type CheckoutFormState,
  statusClassName,
  useAuth,
  type VisitDetail
} from "../app/core";

export function VisitDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [availableGates, setAvailableGates] = useState<Gate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<GuardVisitEditState | null>(null);
  const [checkoutState, setCheckoutState] = useState<CheckoutFormState>(() => buildInitialCheckoutState());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadVisit = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJson<{ visit: VisitDetail }>(`/api/guard/visits/${id}`, {
        method: "GET",
        headers: {}
      });
      setVisit(payload.visit);
      setEditForm(buildGuardVisitEditState(payload.visit));
      setCheckoutState(buildCheckoutStateFromVisit(payload.visit));
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Besuch konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadVisit();
  }, [loadVisit]);

  useEffect(() => {
    async function loadGates() {
      try {
        const payload = await fetchJson<{ gates: Gate[] }>("/api/public/gates", {
          method: "GET",
          headers: {}
        });
        setAvailableGates(payload.gates);
      } catch {
        setAvailableGates([]);
      }
    }

    void loadGates();
  }, []);

  async function handleCheckIn() {
    if (!id) return;
    try {
      setError(null);
      await fetchJson(`/api/guard/visits/${id}/check-in`, { method: "POST", body: JSON.stringify({}) });
      setMessage("Besuch wurde eingecheckt.");
      await loadVisit();
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      const detailFields = Array.isArray(errorPayload.details)
        ? (errorPayload.details as Array<{ message?: string }>).map((item) => item.message).filter(Boolean)
        : [];
      setError(
        detailFields.length
          ? `Check-in nicht moeglich: ${detailFields.join(" ")}`
          : errorPayload.message || "Check-in fehlgeschlagen."
      );
    }
  }

  async function handleCheckOut() {
    if (!id) return;
    try {
      setError(null);
      await fetchJson(`/api/guard/visits/${id}/check-out`, {
        method: "POST",
        body: JSON.stringify({
          returned_badge_number: checkoutState.returnedVisitNumber,
          signed_by_host_confirmed: checkoutState.signedByHostConfirmed
        })
      });
      setMessage("Besuch wurde ausgecheckt.");
      setCheckoutState(buildInitialCheckoutState());
      setIsCheckoutModalOpen(false);
      await loadVisit();
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Check-out fehlgeschlagen.");
    }
  }

  async function handleSaveVisit() {
    if (!id || !editForm) return;
    setFieldErrors({});
    setError(null);
    try {
      await fetchJson(`/api/guard/visits/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editForm,
          birthDate: editForm.birthDate || "",
          validFrom: editForm.validFrom,
          validUntil: editForm.validUntil
        })
      });
      setMessage("Besuchsdaten wurden gespeichert.");
      setIsEditing(false);
      await loadVisit();
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setFieldErrors(extractFieldErrors(errorPayload));
      setError(errorPayload.message || "Besuchsdaten konnten nicht gespeichert werden.");
    }
  }

  const missingRequired = new Set(visit?.completeness?.missingRequiredFields ?? []);

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
        <div className="section-header">
          <div>
            <h2>Besucherdetails</h2>
            <p className="section-copy">Detailansicht mit allen relevanten Besuchsdaten und Aktionen.</p>
          </div>
        </div>

        {message ? <div className="feedback success">{message}</div> : null}
        {error ? <div className="feedback error">{error}</div> : null}
        {loading ? <div className="feedback info">Daten werden geladen...</div> : null}

        {visit ? (
          <>
            <Card className="detail-hero">
              <div className="detail-hero-main">
                <div className="detail-hero-left">
                  <div className="detail-hero-number">{visit.badgeNumber || visit.id.slice(0, 8).toUpperCase()}</div>
                  <div className="detail-hero-status-row">
                    <span className={statusClassName(visit.status)}>{formatStatus(visit.status)}</span>
                    <span className="detail-hero-label">Besuchsnummer</span>
                  </div>
                  <div className="detail-hero-name">{visit.firstName} {visit.lastName}</div>
                  <div className="detail-hero-company">{visit.company}</div>
                  <div className="detail-hero-purpose">Zweck: {visit.purpose}</div>
                </div>
                <div className="detail-hero-right">
                  <div className="detail-hero-item"><span>Gueltig</span><strong>{formatDateOnly(visit.validFrom)} - {formatDateOnly(visit.validUntil)}</strong></div>
                  <div className="detail-hero-item"><span>Check-in</span><strong>{visit.checkInAt ? `${formatDateTime(visit.checkInAt)}${visit.checkInBy ? ` durch ${visit.checkInBy}` : ""}` : "-"}</strong></div>
                  <div className="detail-hero-item"><span>Check-out</span><strong>{visit.checkOutAt ? `${formatDateTime(visit.checkOutAt)}${visit.checkOutBy ? ` durch ${visit.checkOutBy}` : ""}` : "offen"}</strong></div>
                </div>
              </div>
              <div className="detail-next-step">{getNextStepHint(visit)}</div>
              <div className="row-actions action-bar">
                {visit.status === "pre_registered" || visit.status === "checked_in" ? (
                  isEditing ? (
                    <>
                      <button type="button" onClick={() => void handleSaveVisit()}>Speichern</button>
                      <button type="button" className="secondary-button" onClick={() => { setIsEditing(false); setEditForm(buildGuardVisitEditState(visit)); setFieldErrors({}); }}>
                        Abbrechen
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => { setIsEditing(true); setMessage(null); setError(null); }}>
                      Daten bearbeiten
                    </button>
                  )
                ) : null}
                {visit.status === "pre_registered" ? (
                  <button type="button" disabled={!visit.completeness.canCheckIn} onClick={() => void handleCheckIn()}>Einchecken</button>
                ) : null}
                {visit.status === "checked_in" ? (
                  <button type="button" onClick={() => setIsCheckoutModalOpen(true)}>Auschecken</button>
                ) : null}
                {visit.completeness.canPrintBadge ? (
                  <Link className="button-link" to={`/wache/besuche/${visit.id}/druck`}>
                    {visit.status === "checked_out" ? "Besucherschein erneut drucken" : "Besucherschein drucken"}
                  </Link>
                ) : null}
                <button type="button" className="secondary-button" onClick={() => navigate("/wache")}>Zurueck</button>
              </div>
            </Card>

            <Card className="completeness-panel">
              {visit.completeness.errors.length === 0 ? (
                <div className="feedback success compact-feedback">Pruefung: OK</div>
              ) : (
                <div className="feedback error">
                  <strong>Fehlende Pflichtdaten:</strong>
                  <ul className="text-list">
                    {visit.completeness.errors.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.message}</li>)}
                  </ul>
                  <div className="row-actions">
                    <button type="button" onClick={() => setIsEditing(true)}>Fehlende Daten ergaenzen</button>
                  </div>
                </div>
              )}
              {visit.completeness.warnings.length ? (
                <details className="compact-hints compact-hints-warning">
                  <summary>Warnungen anzeigen ({visit.completeness.warnings.length})</summary>
                  <ul className="text-list">{visit.completeness.warnings.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.message}</li>)}</ul>
                </details>
              ) : null}
              {visit.completeness.infos.length ? (
                <details className="compact-hints compact-hints-info">
                  <summary>Optionale Hinweise anzeigen ({visit.completeness.infos.length})</summary>
                  <ul className="text-list">{visit.completeness.infos.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.message}</li>)}</ul>
                </details>
              ) : null}
            </Card>

            {isEditing && editForm ? (
              <div className="form-section edit-guided-stack">
                <div className="row-actions action-bar">
                  <button type="button" onClick={() => void handleSaveVisit()}>Speichern</button>
                  <button type="button" className="secondary-button" onClick={() => { setIsEditing(false); setEditForm(buildGuardVisitEditState(visit)); setFieldErrors({}); }}>
                    Abbrechen
                  </button>
                </div>

                <Card className="edit-required-card">
                  <h3>Pflichtdaten fuer Check-in und Druck</h3>
                  <div className="form-grid two-columns">
                    {currentUser?.role === "admin" ? (
                      <FormField label="Wache" error={fieldErrors.gateId}>
                        <select value={editForm.gateId} onChange={(event) => setEditForm((current) => current ? { ...current, gateId: event.target.value } : current)}>
                          <option value="">Noch nicht zugeordnet</option>
                          {availableGates.map((gate) => (
                            <option key={gate.id} value={gate.id}>{gate.name}</option>
                          ))}
                        </select>
                      </FormField>
                    ) : null}
                    <FormField label="Vorname" required error={fieldErrors.firstName}><input className={missingRequired.has("Vorname") ? "required-missing" : ""} value={editForm.firstName} onChange={(event) => setEditForm((current) => current ? { ...current, firstName: event.target.value } : current)} /></FormField>
                    <FormField label="Nachname" required error={fieldErrors.lastName}><input className={missingRequired.has("Nachname") ? "required-missing" : ""} value={editForm.lastName} onChange={(event) => setEditForm((current) => current ? { ...current, lastName: event.target.value } : current)} /></FormField>
                    <FormField label="Firma / Organisation" required error={fieldErrors.company}><input className={missingRequired.has("Firma / Organisation") ? "required-missing" : ""} value={editForm.company} onChange={(event) => setEditForm((current) => current ? { ...current, company: event.target.value } : current)} /></FormField>
                    <FormField label="Ansprechpartner" required error={fieldErrors.hostName}><input className={missingRequired.has("Ansprechpartner") ? "required-missing" : ""} value={editForm.hostName} onChange={(event) => setEditForm((current) => current ? { ...current, hostName: event.target.value } : current)} /></FormField>
                    <FormField label="Ansprechpartner Telefon" required error={fieldErrors.hostPhone}><input className={missingRequired.has("Ansprechpartner Telefon") ? "required-missing" : ""} value={editForm.hostPhone} onChange={(event) => setEditForm((current) => current ? { ...current, hostPhone: event.target.value } : current)} /></FormField>
                    <FormField label="Besuchszweck" required error={fieldErrors.purpose}><input className={missingRequired.has("Besuchszweck") ? "required-missing" : ""} value={editForm.purpose} onChange={(event) => setEditForm((current) => current ? { ...current, purpose: event.target.value } : current)} /></FormField>
                    <FormField label="Gueltig von" required error={fieldErrors.validFrom}><input className={missingRequired.has("Gueltig von") ? "required-missing" : ""} type="date" value={editForm.validFrom} onChange={(event) => setEditForm((current) => current ? { ...current, validFrom: event.target.value } : current)} /></FormField>
                    <FormField label="Gueltig bis" required error={fieldErrors.validUntil}><input className={missingRequired.has("Gueltig bis") ? "required-missing" : ""} type="date" value={editForm.validUntil} onChange={(event) => setEditForm((current) => current ? { ...current, validUntil: event.target.value } : current)} /></FormField>
                  </div>
                </Card>

                <Card>
                  <h3>Optionale Kontaktdaten</h3>
                  <div className="form-grid two-columns">
                    <FormField label="Geburtsdatum" error={fieldErrors.birthDate}><input type="date" value={editForm.birthDate} onChange={(event) => setEditForm((current) => current ? { ...current, birthDate: event.target.value } : current)} /></FormField>
                    <FormField label="Telefon Besucher" error={fieldErrors.phone}><input value={editForm.phone} onChange={(event) => setEditForm((current) => current ? { ...current, phone: event.target.value } : current)} /></FormField>
                    <FormField label="E-Mail Besucher" error={fieldErrors.email}><input value={editForm.email} onChange={(event) => setEditForm((current) => current ? { ...current, email: event.target.value } : current)} /></FormField>
                    <FormField label="Kennzeichen" error={fieldErrors.licensePlate}><input value={editForm.licensePlate} onChange={(event) => setEditForm((current) => current ? { ...current, licensePlate: event.target.value } : current)} /></FormField>
                    <FormField label="Ansprechpartner E-Mail" error={fieldErrors.hostEmail}><input value={editForm.hostEmail} onChange={(event) => setEditForm((current) => current ? { ...current, hostEmail: event.target.value } : current)} /></FormField>
                    <FormField label="Abteilung / Bereich" error={fieldErrors.hostDepartment}><input value={editForm.hostDepartment} onChange={(event) => setEditForm((current) => current ? { ...current, hostDepartment: event.target.value } : current)} /></FormField>
                  </div>
                </Card>

                <Card>
                  <h3>Adresse</h3>
                  <p className="section-copy">Adresse ist vollstaendig, wenn Strasse, Hausnummer, PLZ und Wohnort gesetzt sind.</p>
                  <div className="form-grid two-columns">
                    <FormField label="Strasse" required error={fieldErrors.visitorStreet}><input className={missingRequired.has("Strasse") || missingRequired.has("Adresse") ? "required-missing" : ""} value={editForm.visitorStreet} onChange={(event) => setEditForm((current) => current ? { ...current, visitorStreet: event.target.value } : current)} /></FormField>
                    <FormField label="Hausnummer" required error={fieldErrors.visitorHouseNumber}><input className={missingRequired.has("Hausnummer") || missingRequired.has("Adresse") ? "required-missing" : ""} value={editForm.visitorHouseNumber} onChange={(event) => setEditForm((current) => current ? { ...current, visitorHouseNumber: event.target.value } : current)} /></FormField>
                    <FormField label="PLZ" required error={fieldErrors.visitorPostalCode}><input className={missingRequired.has("PLZ") || missingRequired.has("Adresse") ? "required-missing" : ""} value={editForm.visitorPostalCode} onChange={(event) => setEditForm((current) => current ? { ...current, visitorPostalCode: event.target.value } : current)} /></FormField>
                    <FormField label="Wohnort" required error={fieldErrors.visitorCity}><input className={missingRequired.has("Wohnort") || missingRequired.has("Adresse") ? "required-missing" : ""} value={editForm.visitorCity} onChange={(event) => setEditForm((current) => current ? { ...current, visitorCity: event.target.value } : current)} /></FormField>
                  </div>
                </Card>

                <Card>
                  <h3>Ausweisdaten</h3>
                  <p className="section-copy">Ausweisdaten werden fuer den Wache-Prozess erfasst und nicht in Uebersichten angezeigt.</p>
                  <div className="form-grid two-columns">
                    <FormField label="Ausweisart" required error={fieldErrors.idDocumentType}><select className={missingRequired.has("Ausweisart") ? "required-missing" : ""} value={editForm.idDocumentType} onChange={(event) => setEditForm((current) => current ? { ...current, idDocumentType: event.target.value as GuardVisitEditState["idDocumentType"] } : current)}><option value="">-</option><option value="identity_card">Personalausweis</option><option value="passport">Reisepass</option><option value="other">Sonstiges</option></select></FormField>
                    <FormField label="Ausweis gueltig bis" required error={fieldErrors.idDocumentValidUntil}><input className={missingRequired.has("Ausweis gueltig bis") ? "required-missing" : ""} type="date" value={editForm.idDocumentValidUntil} onChange={(event) => setEditForm((current) => current ? { ...current, idDocumentValidUntil: event.target.value } : current)} /></FormField>
                    <FormField label="Ausweisnummer" required error={fieldErrors.idDocumentNumber}><input className={missingRequired.has("Ausweisnummer") ? "required-missing" : ""} value={editForm.idDocumentNumber} onChange={(event) => setEditForm((current) => current ? { ...current, idDocumentNumber: event.target.value } : current)} /></FormField>
                    <FormField label="Ausstellungsort" required error={fieldErrors.idDocumentIssuingPlace}><input className={missingRequired.has("Ausstellungsort") ? "required-missing" : ""} value={editForm.idDocumentIssuingPlace} onChange={(event) => setEditForm((current) => current ? { ...current, idDocumentIssuingPlace: event.target.value } : current)} /></FormField>
                  </div>
                </Card>

                <details className="panel">
                  <summary>Ziel / Raum optional</summary>
                  <div className="form-grid two-columns">
                    <FormField label="Dienststelle / Einheit"><input value={editForm.hostUnit} onChange={(event) => setEditForm((current) => current ? { ...current, hostUnit: event.target.value } : current)} /></FormField>
                    <FormField label="Gebaeude / Hausnummer"><input value={editForm.hostBuilding} onChange={(event) => setEditForm((current) => current ? { ...current, hostBuilding: event.target.value } : current)} /></FormField>
                    <FormField label="Zimmernummer"><input value={editForm.hostRoom} onChange={(event) => setEditForm((current) => current ? { ...current, hostRoom: event.target.value } : current)} /></FormField>
                    <FormField label="Apparat / Durchwahl"><input value={editForm.hostExtension} onChange={(event) => setEditForm((current) => current ? { ...current, hostExtension: event.target.value } : current)} /></FormField>
                  </div>
                </details>

                <details className="panel">
                  <summary>Besuchs-Zusatzdaten optional</summary>
                  <div className="form-grid two-columns">
                    <FormField label="Besuchszweck-Art"><select value={editForm.visitPurposeType} onChange={(event) => setEditForm((current) => current ? { ...current, visitPurposeType: event.target.value as GuardVisitEditState["visitPurposeType"] } : current)}><option value="">-</option><option value="private">privat</option><option value="business">geschaeftlich</option></select></FormField>
                    <FormField label="Auftrag Firma / Dienststelle"><input value={editForm.visitCompanyOrder} onChange={(event) => setEditForm((current) => current ? { ...current, visitCompanyOrder: event.target.value } : current)} /></FormField>
                    <FormField label="Besuch beendet / Weitergeleitet"><select value={editForm.visitEndType} onChange={(event) => setEditForm((current) => current ? { ...current, visitEndType: event.target.value as GuardVisitEditState["visitEndType"] } : current)}><option value="">-</option><option value="ended">beendet</option><option value="forwarded">weitergeleitet</option></select></FormField>
                    <FormField label="Weitergeleitet an"><input value={editForm.forwardedToNote} onChange={(event) => setEditForm((current) => current ? { ...current, forwardedToNote: event.target.value } : current)} /></FormField>
                  </div>
                </details>

                <Card>
                  <h3>Bemerkung</h3>
                  <FormField label="Bemerkung" error={fieldErrors.notes}><textarea rows={3} value={editForm.notes} onChange={(event) => setEditForm((current) => current ? { ...current, notes: event.target.value } : current)} /></FormField>
                </Card>

                <div className="row-actions action-bar">
                  <button type="button" onClick={() => void handleSaveVisit()}>Speichern</button>
                  <button type="button" className="secondary-button" onClick={() => { setIsEditing(false); setEditForm(buildGuardVisitEditState(visit)); setFieldErrors({}); }}>
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <div className="detail-card-grid">
                <Card>
                  <h3>Besucher</h3>
                  <div className="detail-grid">
                    <div><span className="detail-label">Name</span><strong>{visit.firstName} {visit.lastName}</strong></div>
                    <div><span className="detail-label">Firma / Organisation</span><strong>{visit.company}</strong></div>
                    {visit.birthDate ? <div><span className="detail-label">Geburtsdatum</span><strong>{formatDateOnly(visit.birthDate)}</strong></div> : null}
                    {visit.visitorPhone ? <div><span className="detail-label">Telefon</span><strong>{visit.visitorPhone}</strong></div> : null}
                    {visit.visitorEmail ? <div><span className="detail-label">E-Mail</span><strong>{visit.visitorEmail}</strong></div> : null}
                    {visit.licensePlate ? <div><span className="detail-label">Kennzeichen</span><strong>{visit.licensePlate}</strong></div> : null}
                    {visit.visitorStreet || visit.visitorHouseNumber || visit.visitorPostalCode || visit.visitorCity ? (
                      <div className="detail-span-2">
                        <span className="detail-label">Adresse</span>
                        <strong>
                          {[visit.visitorStreet, visit.visitorHouseNumber, visit.visitorPostalCode, visit.visitorCity].filter(Boolean).join(", ")}
                        </strong>
                      </div>
                    ) : null}
                  </div>
                </Card>
                <Card>
                  <h3>Ansprechpartner</h3>
                  <div className="detail-grid">
                    <div><span className="detail-label">Ansprechpartner</span><strong>{visit.hostName}</strong></div>
                    <div><span className="detail-label">Telefon</span><strong>{visit.hostPhone || "-"}</strong></div>
                    {visit.hostEmail ? <div><span className="detail-label">E-Mail</span><strong>{visit.hostEmail}</strong></div> : null}
                    {visit.hostDepartment ? <div><span className="detail-label">Abteilung / Bereich</span><strong>{visit.hostDepartment}</strong></div> : null}
                    {visit.hostUnit ? <div><span className="detail-label">Dienststelle / Einheit</span><strong>{visit.hostUnit}</strong></div> : null}
                    {visit.hostBuilding ? <div><span className="detail-label">Gebaeude / Haus</span><strong>{visit.hostBuilding}</strong></div> : null}
                    {visit.hostRoom ? <div><span className="detail-label">Zimmer</span><strong>{visit.hostRoom}</strong></div> : null}
                    {visit.hostExtension ? <div><span className="detail-label">Apparat</span><strong>{visit.hostExtension}</strong></div> : null}
                  </div>
                </Card>
                <Card>
                  <h3>Besuch</h3>
                  <div className="detail-grid">
                    <div><span className="detail-label">Besuchszweck</span><strong>{visit.purpose}</strong></div>
                    <div><span className="detail-label">Wache</span><strong>{visit.gateName || "-"}</strong></div>
                    <div><span className="detail-label">Gueltig von</span><strong>{formatDateOnly(visit.validFrom)}</strong></div>
                    <div><span className="detail-label">Gueltig bis</span><strong>{formatDateOnly(visit.validUntil)}</strong></div>
                    {visit.notes ? <div className="detail-span-2"><span className="detail-label">Bemerkung</span><strong>{visit.notes}</strong></div> : null}
                    {visit.visitPurposeType ? <div><span className="detail-label">Besuchszweck-Art</span><strong>{visit.visitPurposeType}</strong></div> : null}
                    {visit.visitCompanyOrder ? <div><span className="detail-label">Auftrag Firma / Dienststelle</span><strong>{visit.visitCompanyOrder}</strong></div> : null}
                  </div>
                </Card>
                <Card className="detail-check-card">
                  <h3>Check-in / Check-out</h3>
                  <div className="detail-grid">
                    <div><span className="detail-label">Eingecheckt am</span><strong>{formatDateTime(visit.checkInAt)}</strong></div>
                    <div><span className="detail-label">Eingecheckt durch</span><strong>{visit.checkInBy || "-"}</strong></div>
                    <div><span className="detail-label">Ausgecheckt am</span><strong>{formatDateTime(visit.checkOutAt)}</strong></div>
                    <div><span className="detail-label">Ausgecheckt durch</span><strong>{visit.checkOutBy || "-"}</strong></div>
                    <div><span className="detail-label">Unterschrift erledigt</span><strong>{visit.signedByHostConfirmed ? "Ja" : "Nein"}</strong></div>
                  </div>
                </Card>

                {(visit.idDocumentType || visit.idDocumentValidUntil || visit.idDocumentNumber || visit.idDocumentIssuingPlace) ? (
                  <details className="panel">
                    <summary>Ausweis / Zusatzdaten</summary>
                    <div className="detail-grid">
                      {visit.idDocumentType ? <div><span className="detail-label">Ausweisart</span><strong>{visit.idDocumentType}</strong></div> : null}
                      {visit.idDocumentValidUntil ? <div><span className="detail-label">Gueltig bis</span><strong>{formatDateOnly(visit.idDocumentValidUntil)}</strong></div> : null}
                      {visit.idDocumentNumber ? <div><span className="detail-label">Ausweisnummer</span><strong>{visit.idDocumentNumber}</strong></div> : null}
                      {visit.idDocumentIssuingPlace ? <div><span className="detail-label">Ausstellungsort</span><strong>{visit.idDocumentIssuingPlace}</strong></div> : null}
                    </div>
                  </details>
                ) : null}
              </div>
            )}

            {isCheckoutModalOpen && visit.status === "checked_in" ? (
              <div className="modal-backdrop">
                <div className="modal-card panel">
                  <h3>Besuch auschecken</h3>
                  <p className="section-copy">Besuchsnummer vom zurueckgegebenen Besucherschein eingeben.</p>
                  <div className="checkout-box">
                    <input
                      placeholder="Besuchsnummer vom Besucherschein"
                      maxLength={5}
                      value={checkoutState.returnedVisitNumber}
                      onChange={(event) => setCheckoutState((current) => ({
                        ...current,
                        returnedVisitNumber: event.target.value.toUpperCase().slice(0, 5)
                      }))}
                    />
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={checkoutState.signedByHostConfirmed}
                        onChange={(event) => setCheckoutState((current) => ({ ...current, signedByHostConfirmed: event.target.checked }))}
                      />
                      Unterschrift vom Ansprechpartner erledigt
                    </label>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      disabled={!checkoutState.returnedVisitNumber.trim() || !checkoutState.signedByHostConfirmed}
                      onClick={() => void handleCheckOut()}
                    >
                      Auschecken
                    </button>
                    <button type="button" className="secondary-button" onClick={() => setIsCheckoutModalOpen(false)}>Abbrechen</button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </main>
    </AppLayout>
  );
}
