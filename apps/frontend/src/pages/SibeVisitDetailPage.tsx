import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert } from "../components/ui";
import { AppLayout, type ApiError, extractFieldErrors, fetchJson, formatApprovalStatus, formatDateOnly, formatDateTime, formatIdDocumentType, formatSignatureStatus, formatStatus, type SibeVisitDetail, useAuth } from "../app/core";

function isExpiredDocument(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const documentValidUntil = new Date(`${value}T23:59:59.999Z`);
  return !Number.isNaN(documentValidUntil.getTime()) && documentValidUntil < new Date();
}

export function SibeVisitDetailPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const isCommanderView = user?.role === "kaskdt";
  const [visit, setVisit] = useState<SibeVisitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [approvalNoteDraft, setApprovalNoteDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingApproval, setSavingApproval] = useState(false);
  const documentExpired = isExpiredDocument(visit?.idDocumentValidUntil ?? null);

  async function loadVisit() {
    try {
      const payload = await fetchJson<{ visit: SibeVisitDetail }>(`/api/sibe/visits/${id}`, { method: "GET", headers: {} });
      setVisit(payload.visit);
      setNotesDraft(payload.visit.notes || "");
      setApprovalNoteDraft(payload.visit.approvalNote || "");
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Besuch konnte nicht geladen werden.");
    }
  }

  useEffect(() => {
    void loadVisit();
  }, [id]);

  async function handleSaveNotes() {
    if (!id) return;

    setSavingNotes(true);
    setError(null);
    setMessage(null);

    try {
      const payload = await fetchJson<{ message: string; notes: string | null }>(`/api/sibe/visits/${id}/notes`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          notes: notesDraft
        })
      });

      setVisit((current) => current ? { ...current, notes: payload.notes } : current);
      setNotesDraft(payload.notes || "");
      setMessage(payload.message);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Anmerkung konnte nicht gespeichert werden.");
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleApprovalDecision(status: "approved" | "rejected") {
    if (!id) return;
    const note = approvalNoteDraft.trim();

    if (status === "rejected" && !note) {
      setError("Bitte einen Hinweis für die Ablehnung eintragen.");
      setMessage(null);
      return;
    }

    setSavingApproval(true);
    setError(null);
    setMessage(null);

    try {
      const payload = await fetchJson<{ success: boolean; approvalStatus: string; approvalNote: string | null }>(`/api/sibe/visits/${id}/approval`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status,
          note
        })
      });

      setMessage(status === "approved" ? "Besuch freigegeben." : "Besuch abgelehnt.");
      await loadVisit();
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      const fieldErrors = extractFieldErrors(errorPayload);
      setError(fieldErrors.note || errorPayload.message || "Die Freigabe konnte nicht gespeichert werden.");
    } finally {
      setSavingApproval(false);
    }
  }

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
        <div className="section-header">
          <div>
            <h2>{isCommanderView ? "Besuchsdetails" : "SiBe Besuchsdetails"}</h2>
          </div>
        </div>
        {message ? <Alert type="success">{message}</Alert> : null}
        {error ? <Alert type="error">{error}</Alert> : null}
        {visit ? (
          <>
            {!isCommanderView ? (
              <>
                <section className="form-section">
                  <h3>Anmerkung für Druck und Besuch</h3>
                  <label>
                    <span className="visually-hidden">Anmerkung</span>
                    <textarea
                      value={notesDraft}
                      onChange={(event) => setNotesDraft(event.target.value)}
                      placeholder="Anmerkung für Besucherausweis und Nachverfolgung"
                    />
                  </label>
                  <div className="row-actions">
                    <button type="button" onClick={() => void handleSaveNotes()} disabled={savingNotes}>
                      {savingNotes ? "Speichert..." : "Anmerkung speichern"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setNotesDraft(visit.notes || "")}
                      disabled={savingNotes}
                    >
                      Zurücksetzen
                    </button>
                  </div>
                </section>
                <section className="form-section">
                  <h3>SiBe-Freigabe</h3>
                  {documentExpired ? <Alert type="warning">Warnung: Das Ausweisdokument ist zum Besuchstermin abgelaufen.</Alert> : null}
                  <div className="detail-grid">
                    <div><span className="detail-label">Freigabestatus</span><strong>{formatApprovalStatus(visit.approvalStatus)}</strong></div>
                    <div><span className="detail-label">Entscheidung durch</span><strong>{visit.approvalDecidedBy || "-"}</strong></div>
                    <div><span className="detail-label">Entscheidung am</span><strong>{formatDateTime(visit.approvalDecidedAt)}</strong></div>
                  </div>
                  <label>
                    <span className="visually-hidden">Freigabehinweis</span>
                    <textarea
                      value={approvalNoteDraft}
                      onChange={(event) => setApprovalNoteDraft(event.target.value)}
                      placeholder="Hinweis für Freigabe oder Ablehnung"
                    />
                  </label>
                  {visit.status === "pre_registered" ? (
                    <div className="row-actions">
                      <button type="button" onClick={() => void handleApprovalDecision("approved")} disabled={savingApproval}>
                        {savingApproval ? "Speichert..." : "Freigeben"}
                      </button>
                      <button type="button" className="danger-button" onClick={() => void handleApprovalDecision("rejected")} disabled={savingApproval}>
                        Ablehnen
                      </button>
                    </div>
                  ) : null}
                </section>
              </>
            ) : (
              <section className="form-section">
                <h3>Freigabe- und Bearbeitungsstand</h3>
                <div className="detail-grid">
                  <div><span className="detail-label">Freigabestatus</span><strong>{formatApprovalStatus(visit.approvalStatus)}</strong></div>
                  <div><span className="detail-label">Entscheidung durch</span><strong>{visit.approvalDecidedBy || "-"}</strong></div>
                  <div><span className="detail-label">Entscheidung am</span><strong>{formatDateTime(visit.approvalDecidedAt)}</strong></div>
                </div>
              </section>
            )}
            <dl className="details-list">
              <div><dt>Besuchsnummer</dt><dd>{visit.badgeNumber || visit.id.slice(0, 8).toUpperCase()}</dd></div>
              <div><dt>Status</dt><dd>{formatStatus(visit.status)}</dd></div>
              <div><dt>Freigabe</dt><dd>{formatApprovalStatus(visit.approvalStatus)}</dd></div>
              <div><dt>Besuchername</dt><dd>{visit.firstName} {visit.lastName}</dd></div>
              <div><dt>Geburtsdatum</dt><dd>{formatDateOnly(visit.birthDate)}</dd></div>
              <div><dt>Firma</dt><dd>{visit.company}</dd></div>
              <div><dt>Telefon</dt><dd>{visit.visitorPhone || "-"}</dd></div>
              <div><dt>E-Mail</dt><dd>{visit.visitorEmail || "-"}</dd></div>
              <div><dt>Kennzeichen</dt><dd>{visit.licensePlate || "-"}</dd></div>
              <div><dt>Straße</dt><dd>{visit.visitorStreet || "-"}</dd></div>
              <div><dt>Hausnummer</dt><dd>{visit.visitorHouseNumber || "-"}</dd></div>
              <div><dt>PLZ</dt><dd>{visit.visitorPostalCode || "-"}</dd></div>
              <div><dt>Ort</dt><dd>{visit.visitorCity || "-"}</dd></div>
              <div><dt>Ausweisart</dt><dd>{formatIdDocumentType(visit.idDocumentType)}</dd></div>
              <div><dt>Ausweis gültig bis</dt><dd>{formatDateOnly(visit.idDocumentValidUntil)}</dd></div>
              <div><dt>Ausweisnummer</dt><dd>{visit.idDocumentNumber || "-"}</dd></div>
              <div><dt>Ansprechpartner</dt><dd>{visit.hostName}</dd></div>
              <div><dt>Ansprechpartner E-Mail</dt><dd>{visit.hostEmail || "-"}</dd></div>
              <div><dt>Ansprechpartner Telefon</dt><dd>{visit.hostPhone || "-"}</dd></div>
              <div><dt>Abteilung / Bereich</dt><dd>{visit.hostDepartment}</dd></div>
              <div><dt>Dienststelle / Einheit</dt><dd>{visit.hostUnit || "-"}</dd></div>
              <div><dt>Gebäude</dt><dd>{visit.hostBuilding || "-"}</dd></div>
              <div><dt>Zimmer</dt><dd>{visit.hostRoom || "-"}</dd></div>
              <div><dt>Apparat / Durchwahl</dt><dd>{visit.hostExtension || "-"}</dd></div>
              <div><dt>Besuchszweck</dt><dd>{visit.purpose}</dd></div>
              <div><dt>Besuchszweck-Art</dt><dd>{visit.visitPurposeType || "-"}</dd></div>
              <div><dt>Im Auftrag</dt><dd>{visit.visitCompanyOrder || "-"}</dd></div>
              <div><dt>Wache</dt><dd>{visit.gateName}</dd></div>
              <div><dt>Gültig von</dt><dd>{formatDateOnly(visit.validFrom)}</dd></div>
              <div><dt>Gültig bis</dt><dd>{formatDateOnly(visit.validUntil)}</dd></div>
              <div><dt>Check-in-Zeit</dt><dd>{formatDateTime(visit.checkInAt)}</dd></div>
              <div><dt>Check-in durch</dt><dd>{visit.checkInBy || "-"}</dd></div>
              <div><dt>Check-out-Zeit</dt><dd>{formatDateTime(visit.checkOutAt)}</dd></div>
              <div><dt>Check-out durch</dt><dd>{visit.checkOutBy || "-"}</dd></div>
              <div><dt>Bemerkung</dt><dd>{visit.notes || "-"}</dd></div>
              <div><dt>Freigabehinweis</dt><dd>{visit.approvalNote || "-"}</dd></div>
              <div><dt>Ausfahrt-Bemerkung</dt><dd>{visit.checkoutNote || "-"}</dd></div>
              <div><dt>Unterschriftsstatus</dt><dd>{formatSignatureStatus(visit.hostSignatureStatus)}</dd></div>
              <div><dt>Unterschriftsdatum</dt><dd>{formatDateOnly(visit.hostSignatureDate)}</dd></div>
              <div><dt>Erfasst durch</dt><dd>{visit.hostSignatureConfirmedBy || "-"}</dd></div>
              <div><dt>Erfasst am</dt><dd>{formatDateTime(visit.hostSignatureConfirmedAt)}</dd></div>
              <div><dt>Hinweis Unterschrift</dt><dd>{visit.hostSignatureNote || "-"}</dd></div>
              <div><dt>Besuchsende-Typ</dt><dd>{visit.visitEndType || "-"}</dd></div>
              <div><dt>Weitergeleitet an</dt><dd>{visit.forwardedToNote || "-"}</dd></div>
              <div><dt>Rückgabe bestätigt</dt><dd>{visit.deviceReturnConfirmed ? "Ja" : "Nein"}</dd></div>
              <div><dt>Rückgabe-Zeit</dt><dd>{formatDateTime(visit.deviceReturnedAt)}</dd></div>
              <div><dt>Rückgabe durch</dt><dd>{visit.deviceReturnedBy || "-"}</dd></div>
            </dl>
            <div className="row-actions">
              <Link className="button-link" to={isCommanderView ? "/kaskdt/besucher" : "/sibe/besucher"}>Zurück</Link>
            </div>
          </>
        ) : null}
      </main>
    </AppLayout>
  );
}
