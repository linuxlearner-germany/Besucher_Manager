import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppLayout, type ApiError, fetchJson, formatDateOnly, type VisitDetail } from "../app/core";

export function PrintViewPage() {
  const { id } = useParams();
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVisit() {
      setLoading(true);

      try {
        const payload = await fetchJson<{ visit: VisitDetail }>(`/api/guard/visits/${id}`, {
          method: "GET",
          headers: {}
        });
        setVisit(payload.visit);
      } catch (apiError) {
        const errorPayload = apiError as ApiError;
        setError(errorPayload.message || "Die Druckansicht konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    }

    void loadVisit();
  }, [id]);

  async function handlePrint() {
    if (!id) {
      return;
    }
    if (visit?.completeness?.errors?.length) {
      setError(`Vor dem Drucken fehlen Pflichtdaten: ${visit.completeness.errors.map((item) => item.message).join(" ")}`);
      return;
    }

    try {
      await fetchJson<{ success: boolean }>(`/api/guard/visits/${id}/print-log`, {
        method: "POST",
        body: JSON.stringify({})
      });
    } catch {
      // Auditlog-Versuch darf den Druck nicht blockieren.
    }

    window.print();
  }

  const securityTexts = visit?.badgeTexts.filter((text) => text.textType === "security_notice" || text.textType === "footer") ?? [];
  const photoBanText = visit?.badgeTexts.find((text) => text.textType === "photo_ban")?.content
    || "Fotografieren und Filmen auf dem Gelaende ist verboten.";
  const signatureText = visit?.badgeTexts.find((text) => text.textType === "signature_notice")?.content
    || "Vor Ausfahrt / Verlassen des Gelaendes durch den Ansprechpartner zu unterschreiben.";
  const hasOptionalPageTwoContent = Boolean(visit?.siteMap || securityTexts.length);

  return (
    <AppLayout>
      <main className="panel print-panel">
        {loading ? <div className="feedback info">Druckansicht wird geladen...</div> : null}
        {error ? <div className="feedback error">{error}</div> : null}

        {visit ? (
          <div className="print-layout">
            <div className="print-toolbar no-print">
              <button type="button" onClick={handlePrint} disabled={Boolean(visit.completeness?.errors?.length)}>Drucken</button>
              <Link className="button-link" to="/wache">Zurueck zur Wache</Link>
            </div>

            {visit.completeness?.errors?.length ? (
              <div className="feedback error no-print">
                Vor dem Drucken fehlen noch Pflichtdaten:
                <ul className="text-list">
                  {visit.completeness.errors.map((item, index) => <li key={`${item.field}-${index}`}>{item.message}</li>)}
                </ul>
                <Link className="button-link" to={`/wache/besuche/${visit.id}`}>Daten jetzt ergaenzen</Link>
              </div>
            ) : null}

            <div className="feedback info no-print">
              Wenn der Browser URL, Datum oder Seitenzahl mitdruckt, bitte im Druckdialog die Option fuer Kopf- und Fusszeilen deaktivieren.
            </div>

            <div className="badge-sheet print-page page-1">
              <header className="badge-header">
                <div>
                  <p className="eyebrow">Besucherschein</p>
                  <h2>BESUCHER</h2>
                </div>
                <div className="badge-number">
                  Besuchsnummer
                  <strong>{visit.badgeNumber || visit.id.slice(0, 8).toUpperCase()}</strong>
                </div>
              </header>

              <section className="badge-grid">
                <div><span>Name</span><strong>{visit.firstName} {visit.lastName}</strong></div>
                <div><span>Geburtsdatum</span><strong>{formatDateOnly(visit.birthDate)}</strong></div>
                <div><span>Firma / Organisation</span><strong>{visit.company}</strong></div>
                <div><span>Adresse</span><strong>{[visit.visitorStreet, visit.visitorHouseNumber, visit.visitorPostalCode, visit.visitorCity].filter(Boolean).join(", ") || "-"}</strong></div>
                <div><span>Ansprechpartner</span><strong>{visit.hostName}</strong></div>
                <div><span>Ansprechpartner Kontakt</span><strong>{visit.hostPhone || visit.hostEmail ? [visit.hostPhone, visit.hostEmail].filter(Boolean).join(" / ") : "-"}</strong></div>
                <div><span>Besuchszweck</span><strong>{visit.purpose}</strong></div>
                <div><span>Wache / Eingang</span><strong>{visit.gateName}</strong></div>
                <div><span>Gueltig von</span><strong>{formatDateOnly(visit.validFrom)}</strong></div>
                <div><span>Gueltig bis</span><strong>{formatDateOnly(visit.validUntil)}</strong></div>
                <div><span>Kennzeichen</span><strong>{visit.licensePlate || "-"}</strong></div>
                <div><span>Ausweisart</span><strong>{visit.idDocumentType || "-"}</strong></div>
                <div><span>Ausweis gueltig bis</span><strong>{formatDateOnly(visit.idDocumentValidUntil)}</strong></div>
                <div><span>Ausweisnummer</span><strong>{visit.idDocumentNumber || "-"}</strong></div>
                <div><span>Ausstellungsort</span><strong>{visit.idDocumentIssuingPlace || "-"}</strong></div>
              </section>

              <section className="signature-section">
                <h3>Unterschrift Ansprechpartner</h3>
                <div className="signature-box">
                  <div className="signature-line" />
                </div>
                <p>{signatureText}</p>
              </section>
            </div>

            {hasOptionalPageTwoContent ? (
              <div className="badge-sheet print-page page-2">
                <section className="print-columns">
                  <div className="print-block avoid-break">
                    <h3>Sicherheitshinweise</h3>
                    {securityTexts.length ? (
                      <ul className="text-list compact-list">
                        {securityTexts.map((text) => (
                          <li key={text.id}>
                            <strong>{text.name}:</strong> {text.content}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul className="text-list compact-list">
                        <li>Fotografieren nur mit ausdruecklicher Freigabe.</li>
                        <li>Bitte sichtbar tragen und beim Verlassen an der Pforte abmelden.</li>
                      </ul>
                    )}

                    <div className="print-callout">
                      <strong>Fotografierverbot</strong>
                      <p>{photoBanText}</p>
                    </div>
                  </div>
                  <div className="print-block avoid-break">
                    <h3>Gelaendeplan</h3>
                    {visit.siteMap ? (
                      <img className="site-map site-map-print" src={visit.siteMap.filePath} alt={visit.siteMap.name} />
                    ) : (
                      <p className="section-copy">Kein aktiver Gelaendeplan hinterlegt.</p>
                    )}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        ) : null}
      </main>
    </AppLayout>
  );
}
