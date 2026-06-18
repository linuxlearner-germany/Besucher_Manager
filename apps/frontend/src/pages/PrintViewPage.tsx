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

  return (
    <AppLayout>
      <main className="panel print-panel">
        {loading ? <div className="feedback info">Druckansicht wird geladen...</div> : null}
        {error ? <div className="feedback error">{error}</div> : null}

        {visit ? (
          <div className="print-layout">
            <div className="print-toolbar no-print">
              <button type="button" onClick={handlePrint}>Drucken</button>
              <Link className="button-link" to="/wache">Zurueck zur Wache</Link>
            </div>

            {visit.completeness?.errors?.length ? (
              <div className="feedback warning no-print">
                Es fehlen noch einige Angaben. Der Ausdruck ist trotzdem moeglich:
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

              <section className="print-front-grid">
                <article className="print-info-card">
                  <h3>Besucher</h3>
                  <dl className="print-info-list">
                    <div><dt>Name</dt><dd>{visit.firstName} {visit.lastName}</dd></div>
                    <div><dt>Geburtsdatum</dt><dd>{formatDateOnly(visit.birthDate)}</dd></div>
                    <div><dt>Firma</dt><dd>{visit.company}</dd></div>
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
                    <div><dt>Art</dt><dd>{visit.idDocumentType || "-"}</dd></div>
                    <div><dt>Gueltig bis</dt><dd>{formatDateOnly(visit.idDocumentValidUntil)}</dd></div>
                    <div><dt>Nummer</dt><dd>{visit.idDocumentNumber || "-"}</dd></div>
                    <div><dt>Ausstellungsort</dt><dd>{visit.idDocumentIssuingPlace || "-"}</dd></div>
                  </dl>
                </article>
              </section>

              <section className="print-front-footer">
                <div className="print-validity-card">
                  <div>
                    <span>Gueltig von</span>
                    <strong>{formatDateOnly(visit.validFrom)}</strong>
                  </div>
                  <div>
                    <span>Gueltig bis</span>
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
                      <li>Fotografieren und Filmen nur mit ausdruecklicher Freigabe.</li>
                      <li>Besucherausweis sichtbar tragen.</li>
                      <li>Aufenthalt nur in freigegebenen Bereichen.</li>
                      <li>Beim Verlassen an der Wache abmelden.</li>
                    </ul>
                  )}
                </div>

                <div className="print-callout avoid-break">
                  <strong>Fotografierverbot</strong>
                  <p>{photoBanText}</p>
                </div>

                <div className="print-callout avoid-break">
                  <strong>Rueckgabe und Unterschrift</strong>
                  <p>{signatureText}</p>
                </div>

                <div className="print-callout avoid-break">
                  <strong>Hinweis fuer Besucher</strong>
                  <p>Besucherschein und ausgegebene Unterlagen oder Ausweise bei Aufforderung jederzeit vorzeigen.</p>
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </main>
    </AppLayout>
  );
}
