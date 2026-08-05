import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Card, DataTable } from "../components/ui";
import {
  AppLayout,
  type ApiError,
  fetchJson,
  formatDateOnly,
  type SibeVisitRow
} from "../app/core";

export function SibeRejectionsPage() {
  const [visits, setVisits] = useState<SibeVisitRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const loadVisits = useCallback(async () => {
    setError(null);

    try {
      const payload = await fetchJson<{ visits: SibeVisitRow[] }>("/api/sibe/visits?status=pre_registered", {
        method: "GET",
        headers: {}
      });
      setVisits(payload.visits);
    } catch (apiError) {
      setError((apiError as ApiError).message || "Voranmeldungen konnten nicht geladen werden.");
    }
  }, []);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);

  async function rejectVisit(visit: SibeVisitRow) {
    const note = window.prompt(`Besuch von ${visit.visitorName} ablehnen – Begründung (optional):`);
    if (note === null) return;

    setRejectingId(visit.id);
    setError(null);
    setMessage(null);

    try {
      const payload = await fetchJson<{ message: string }>(`/api/sibe/visits/${visit.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note })
      });
      setMessage(payload.message);
      setVisits((current) => current.filter((entry) => entry.id !== visit.id));
    } catch (apiError) {
      setError((apiError as ApiError).message || "Besuch konnte nicht abgelehnt werden.");
    } finally {
      setRejectingId(null);
    }
  }

  return (
    <AppLayout>
      <main className="page-panel page-shell-wide">
        <section className="page-hero">
          <div className="page-hero-grid">
            <div className="page-hero-content">
              <h2>Voranmeldungen ablehnen</h2>
            </div>
            <div className="hero-stat-grid">
              <div className="hero-stat-card">
                <span className="hero-stat-label">Offene Voranmeldungen</span>
                <strong className="hero-stat-value">{visits.length}</strong>
              </div>
            </div>
          </div>
        </section>

        {message ? <Alert type="success">{message}</Alert> : null}
        {error ? <Alert type="error">{error}</Alert> : null}

        <Card>
          <div className="section-header">
            <div><h3>Prüfliste</h3></div>
            <button type="button" className="secondary-button" onClick={() => void loadVisits()}>Aktualisieren</button>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>Besucher</th>
                <th>Firma</th>
                <th>Ansprechpartner</th>
                <th>Wache</th>
                <th>Gültig von</th>
                <th>Gültig bis</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((visit) => (
                <tr key={visit.id}>
                  <td>{visit.visitorName}</td>
                  <td>{visit.company}</td>
                  <td>{visit.hostName}</td>
                  <td>{visit.gateName}</td>
                  <td>{formatDateOnly(visit.validFrom)}</td>
                  <td>{formatDateOnly(visit.validUntil)}</td>
                  <td className="row-actions">
                    <Link className="button-link" to={`/sibe/besucher/${visit.id}`}>Details</Link>
                    <button type="button" className="danger-button" onClick={() => void rejectVisit(visit)} disabled={rejectingId === visit.id}>
                      {rejectingId === visit.id ? "Lehnt ab..." : "Ablehnen"}
                    </button>
                  </td>
                </tr>
              ))}
              {visits.length === 0 ? <tr><td colSpan={7}>Keine offenen Voranmeldungen vorhanden.</td></tr> : null}
            </tbody>
          </DataTable>
        </Card>
      </main>
    </AppLayout>
  );
}
