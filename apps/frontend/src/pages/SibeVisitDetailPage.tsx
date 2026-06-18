import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert } from "../components/ui";
import { AppLayout, type ApiError, fetchJson, formatDateOnly, formatDateTime, formatSignatureStatus, formatStatus, type SibeVisitDetail } from "../app/core";

export function SibeVisitDetailPage() {
  const { id } = useParams();
  const [visit, setVisit] = useState<SibeVisitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVisit() {
      try {
        const payload = await fetchJson<{ visit: SibeVisitDetail }>(`/api/sibe/visits/${id}`, { method: "GET", headers: {} });
        setVisit(payload.visit);
      } catch (apiError) {
        const errorPayload = apiError as ApiError;
        setError(errorPayload.message || "Besuch konnte nicht geladen werden.");
      }
    }

    void loadVisit();
  }, [id]);

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
        <div className="section-header">
          <div>
            <h2>SiBe Besuchsdetails</h2>
            <p className="section-copy">Reine Leseansicht fuer Recherche und Nachvollziehbarkeit.</p>
          </div>
        </div>
        {error ? <Alert type="error">{error}</Alert> : null}
        {visit ? (
          <>
            <dl className="details-list">
              <div><dt>Besuchsnummer</dt><dd>{visit.badgeNumber || visit.id.slice(0, 8).toUpperCase()}</dd></div>
              <div><dt>Status</dt><dd>{formatStatus(visit.status)}</dd></div>
              <div><dt>Besuchername</dt><dd>{visit.firstName} {visit.lastName}</dd></div>
              <div><dt>Geburtsdatum</dt><dd>{formatDateOnly(visit.birthDate)}</dd></div>
              <div><dt>Firma</dt><dd>{visit.company}</dd></div>
              <div><dt>Telefon</dt><dd>{visit.visitorPhone || "-"}</dd></div>
              <div><dt>E-Mail</dt><dd>{visit.visitorEmail || "-"}</dd></div>
              <div><dt>Kennzeichen</dt><dd>{visit.licensePlate || "-"}</dd></div>
              <div><dt>Strasse</dt><dd>{visit.visitorStreet || "-"}</dd></div>
              <div><dt>Hausnummer</dt><dd>{visit.visitorHouseNumber || "-"}</dd></div>
              <div><dt>PLZ</dt><dd>{visit.visitorPostalCode || "-"}</dd></div>
              <div><dt>Ort</dt><dd>{visit.visitorCity || "-"}</dd></div>
              <div><dt>Ausweisart</dt><dd>{visit.idDocumentType || "-"}</dd></div>
              <div><dt>Ausweis gueltig bis</dt><dd>{formatDateOnly(visit.idDocumentValidUntil)}</dd></div>
              <div><dt>Ausweisnummer</dt><dd>{visit.idDocumentNumber || "-"}</dd></div>
              <div><dt>Ausstellungsort</dt><dd>{visit.idDocumentIssuingPlace || "-"}</dd></div>
              <div><dt>Ansprechpartner</dt><dd>{visit.hostName}</dd></div>
              <div><dt>Ansprechpartner E-Mail</dt><dd>{visit.hostEmail || "-"}</dd></div>
              <div><dt>Ansprechpartner Telefon</dt><dd>{visit.hostPhone || "-"}</dd></div>
              <div><dt>Abteilung / Bereich</dt><dd>{visit.hostDepartment}</dd></div>
              <div><dt>Dienststelle / Einheit</dt><dd>{visit.hostUnit || "-"}</dd></div>
              <div><dt>Gebaeude</dt><dd>{visit.hostBuilding || "-"}</dd></div>
              <div><dt>Zimmer</dt><dd>{visit.hostRoom || "-"}</dd></div>
              <div><dt>Apparat / Durchwahl</dt><dd>{visit.hostExtension || "-"}</dd></div>
              <div><dt>Besuchszweck</dt><dd>{visit.purpose}</dd></div>
              <div><dt>Besuchszweck-Art</dt><dd>{visit.visitPurposeType || "-"}</dd></div>
              <div><dt>Im Auftrag</dt><dd>{visit.visitCompanyOrder || "-"}</dd></div>
              <div><dt>Wache</dt><dd>{visit.gateName}</dd></div>
              <div><dt>Gueltig von</dt><dd>{formatDateOnly(visit.validFrom)}</dd></div>
              <div><dt>Gueltig bis</dt><dd>{formatDateOnly(visit.validUntil)}</dd></div>
              <div><dt>Check-in-Zeit</dt><dd>{formatDateTime(visit.checkInAt)}</dd></div>
              <div><dt>Check-in durch</dt><dd>{visit.checkInBy || "-"}</dd></div>
              <div><dt>Check-out-Zeit</dt><dd>{formatDateTime(visit.checkOutAt)}</dd></div>
              <div><dt>Check-out durch</dt><dd>{visit.checkOutBy || "-"}</dd></div>
              <div><dt>Bemerkung</dt><dd>{visit.notes || "-"}</dd></div>
              <div><dt>Ausfahrt-Bemerkung</dt><dd>{visit.checkoutNote || "-"}</dd></div>
              <div><dt>Unterschriftsstatus</dt><dd>{formatSignatureStatus(visit.hostSignatureStatus)}</dd></div>
              <div><dt>Unterschriftsdatum</dt><dd>{formatDateOnly(visit.hostSignatureDate)}</dd></div>
              <div><dt>Erfasst durch</dt><dd>{visit.hostSignatureConfirmedBy || "-"}</dd></div>
              <div><dt>Erfasst am</dt><dd>{formatDateTime(visit.hostSignatureConfirmedAt)}</dd></div>
              <div><dt>Hinweis Unterschrift</dt><dd>{visit.hostSignatureNote || "-"}</dd></div>
              <div><dt>Besuchsende-Typ</dt><dd>{visit.visitEndType || "-"}</dd></div>
              <div><dt>Weitergeleitet an</dt><dd>{visit.forwardedToNote || "-"}</dd></div>
              <div><dt>Rueckgabe bestaetigt</dt><dd>{visit.deviceReturnConfirmed ? "Ja" : "Nein"}</dd></div>
              <div><dt>Rueckgabe-Zeit</dt><dd>{formatDateTime(visit.deviceReturnedAt)}</dd></div>
              <div><dt>Rueckgabe durch</dt><dd>{visit.deviceReturnedBy || "-"}</dd></div>
            </dl>
            <div className="row-actions">
              <Link className="button-link" to="/sibe/besucher">Zurueck</Link>
            </div>
          </>
        ) : null}
      </main>
    </AppLayout>
  );
}
