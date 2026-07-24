import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AppLayout, BRANDING, type ApiError, fetchJson, formatDateOnly, formatIdDocumentType, type VisitDetail } from "../app/core";

export function PrintViewPage() {
  const { id } = useParams();
  const location = useLocation();
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paperSize, setPaperSize] = useState<"A4" | "A5">(() => {
    const saved = window.localStorage.getItem("visitor-pass-paper-size");
    return saved === "A4" ? "A4" : "A5";
  });

  useEffect(() => {
    window.localStorage.setItem("visitor-pass-paper-size", paperSize);
  }, [paperSize]);

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

  useEffect(() => {
    if (!visit) {
      return;
    }

    const params = new URLSearchParams(location.search);
    if (params.get("autoprint") !== "1") {
      return;
    }

    const timeout = window.setTimeout(() => {
      void handlePrint();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [location.search, visit]);

  async function handlePrint() {
    if (!id) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const isReprint = params.get("reprint") === "1";

    try {
      await fetchJson<{ success: boolean }>(`/api/guard/visits/${id}/print-log`, {
        method: "POST",
        body: JSON.stringify({ paperSize, reprint: isReprint })
      });
      window.print();
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Der Druck wurde wegen fehlender Pflichtangaben abgebrochen.");
    }
  }

  const cleanPrintText = (content: string) => content
    .replace("Der Besucherschein ist sichtbar zu tragen.", "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const printableSections = (visit?.badgeTexts ?? [])
    .map((text) => ({
      ...text,
      heading: text.customHeading?.trim() || text.name,
      content: cleanPrintText(text.content)
    }))
    .filter((text) => text.content.length > 0)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "de"));
  const signatureText = printableSections.find((text) => text.sectionType === "signature_notice")?.content
    || "Vor Ausfahrt / Verlassen des Geländes durch den Ansprechpartner zu unterschreiben.";

  return (
    <AppLayout>
      <main className="panel print-panel">
        {loading ? <div className="feedback info">Druckansicht wird geladen...</div> : null}
        {error ? <div className="feedback error">{error}</div> : null}

        {visit ? (
          <div className={`print-layout paper-${paperSize.toLowerCase()}`}>
            <style>{`@media print {
              @page { size: ${paperSize} portrait; margin: ${paperSize === "A4" ? "12mm" : "6mm"}; }
              html, body, #root, .shell, .content-container, .app-shell, .app-header, .print-panel, .print-layout {
                width: ${paperSize === "A4" ? "186mm" : "136mm"} !important;
                max-width: ${paperSize === "A4" ? "186mm" : "136mm"} !important;
              }
              .badge-sheet {
                width: ${paperSize === "A4" ? "186mm" : "136mm"} !important;
                max-width: ${paperSize === "A4" ? "186mm" : "136mm"} !important;
                height: ${paperSize === "A4" ? "273mm" : "198mm"} !important;
                max-height: ${paperSize === "A4" ? "273mm" : "198mm"} !important;
              }
              .paper-a4 .print-front-grid { gap: 4mm; }
              .paper-a4 .print-info-card { padding: 3mm; }
              .paper-a4 .print-info-list dd { font-size: 9pt; line-height: 1.2; }
              .paper-a4 .print-info-list dt { font-size: 7.5pt; }
              .paper-a4 .signature-box { min-height: 38mm; }
              .paper-a4 .site-map-print { max-height: 155mm; }
            }`}</style>
            <div className="print-toolbar no-print">
              <fieldset className="paper-size-choice">
                <legend>Papierformat</legend>
                <label><input type="radio" name="paper-size" checked={paperSize === "A5"} onChange={() => setPaperSize("A5")} /> A5</label>
                <label><input type="radio" name="paper-size" checked={paperSize === "A4"} onChange={() => setPaperSize("A4")} /> A4</label>
              </fieldset>
              <button type="button" onClick={handlePrint} disabled={!visit.completeness.canPrintBadge}>Drucken</button>
              <Link className="button-link" to="/wache">Zurück zur Wache</Link>
            </div>

            {visit.completeness?.errors?.length ? (
              <div className="feedback warning no-print">
                Vor dem Druck müssen folgende Pflichtangaben ergänzt werden:
                <ul className="text-list">
                  {visit.completeness.errors.map((item, index) => <li key={`${item.field}-${index}`}>{item.message}</li>)}
                </ul>
                <Link className="button-link" to={`/wache/besuche/${visit.id}`}>Daten jetzt ergänzen</Link>
              </div>
            ) : null}

            <div className="feedback info no-print">
              Wenn der Browser URL, Datum oder Seitenzahl mitdruckt, bitte im Druckdialog die Option für Kopf- und Fußzeilen deaktivieren.
              {paperSize === "A4" ? " Für den Duplexdruck „an langer Kante wenden“ auswählen." : ""}
            </div>

            <div className="badge-sheet print-page page-1">
              <header className="badge-header">
                <div>
                  <h2>Besucherschein</h2>
                </div>
                <div className="badge-header-right">
                  <img className="badge-print-logo" src={BRANDING.logo} alt="WIWeB" />
                  <div className="badge-number">
                    Besuchsnummer
                    <strong>{visit.badgeNumber || visit.id.slice(0, 8).toUpperCase()}</strong>
                  </div>
                </div>
              </header>

              <section className="print-front-grid">
                <article className="print-info-card">
                  <h3>Besucher</h3>
                  <dl className="print-info-list">
                    <div><dt>Name</dt><dd>{visit.firstName} {visit.lastName}</dd></div>
                    <div><dt>Geburtsdatum</dt><dd>{formatDateOnly(visit.birthDate)}</dd></div>
                    <div><dt>Firma</dt><dd>{visit.company}</dd></div>
                    <div><dt>Nationalität</dt><dd>{visit.nationalityName || visit.nationalityCode || "-"}</dd></div>
                    <div><dt>Adresse</dt><dd>{[visit.visitorStreet, visit.visitorHouseNumber, visit.visitorPostalCode, visit.visitorCity].filter(Boolean).join(", ") || "-"}</dd></div>
                    <div><dt>Kontakt</dt><dd>{[visit.visitorPhone, visit.visitorEmail].filter(Boolean).join(" / ") || "-"}</dd></div>
                    <div><dt>Kennzeichen</dt><dd>{visit.licensePlate || "-"}</dd></div>
                  </dl>
                </article>

                <article className="print-info-card">
                  <h3>Ansprechpartner</h3>
                  <dl className="print-info-list">
                    <div><dt>Name</dt><dd>{visit.hostName}</dd></div>
                    <div><dt>Kontakt</dt><dd>{[visit.hostPhone, visit.hostEmail].filter(Boolean).join(" / ") || "-"}</dd></div>
                    <div><dt>Bereich</dt><dd>{visit.hostDepartment || "-"}</dd></div>
                    <div><dt>Einheit</dt><dd>{visit.hostUnit || "-"}</dd></div>
                    <div><dt>Ort</dt><dd>{[visit.hostBuilding, visit.hostRoom].filter(Boolean).join(" / ") || "-"}</dd></div>
                    <div><dt>Durchwahl</dt><dd>{visit.hostExtension || "-"}</dd></div>
                  </dl>
                </article>

                <article className="print-info-card">
                  <h3>Besuch</h3>
                  <dl className="print-info-list">
                    <div><dt>Zweck</dt><dd>{visit.purpose}</dd></div>
                    <div><dt>Zweck-Art</dt><dd>{visit.visitPurposeType || "-"}</dd></div>
                    <div><dt>Im Auftrag</dt><dd>{visit.visitCompanyOrder || "-"}</dd></div>
                    <div><dt>Wache</dt><dd>{visit.gateName}</dd></div>
                    <div><dt>Besuchsende</dt><dd>{visit.visitEndType || "-"}</dd></div>
                    <div><dt>Weitergeleitet an</dt><dd>{visit.forwardedToNote || "-"}</dd></div>
                    <div><dt>Bemerkung</dt><dd>{visit.notes || "-"}</dd></div>
                  </dl>
                </article>

                <article className="print-info-card">
                  <h3>Ausweis</h3>
                  <dl className="print-info-list">
                    <div><dt>Art</dt><dd>{formatIdDocumentType(visit.idDocumentType)}</dd></div>
                    <div><dt>Gültig bis</dt><dd>{formatDateOnly(visit.idDocumentValidUntil)}</dd></div>
                    <div><dt>Nummer</dt><dd>{visit.idDocumentNumber || "-"}</dd></div>
                  </dl>
                </article>
              </section>

              <section className="print-front-footer">
                <div className="print-validity-card">
                  <div>
                    <span>Gültig von</span>
                    <strong>{formatDateOnly(visit.validFrom)}</strong>
                  </div>
                  <div>
                    <span>Gültig bis</span>
                    <strong>{formatDateOnly(visit.validUntil)}</strong>
                  </div>
                  <div>
                    <span>Besuchsnummer</span>
                    <strong>{visit.badgeNumber || visit.id.slice(0, 8).toUpperCase()}</strong>
                  </div>
                </div>

                <div className="signature-section print-signature-compact">
                  <h3>Unterschrift Ansprechpartner</h3>
                  <div className="signature-box">
                    <div className="signature-line" />
                  </div>
                  <p>{signatureText}</p>
                </div>
              </section>
            </div>

            <div className="badge-sheet print-page page-2">
              <section className="print-back-stack">
                {visit.siteMap ? (
                  <div className="print-info-card print-map-card avoid-break">
                    <h3>Geländeplan</h3>
                    <img
                      className="site-map site-map-print"
                      src={visit.siteMap.filePath}
                      alt={visit.siteMap.name}
                    />
                  </div>
                ) : null}

                {printableSections.length ? printableSections.map((text) => (
                  <div key={text.id} className="print-callout avoid-break">
                    <strong>{text.heading}</strong>
                    <p>{text.content}</p>
                  </div>
                )) : (
                  <div className="print-callout avoid-break">
                    <strong>Sicherheitshinweise</strong>
                    <p>Für diesen Besucherschein sind aktuell keine aktiven Hinweistexte hinterlegt.</p>
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </main>
    </AppLayout>
  );
}
