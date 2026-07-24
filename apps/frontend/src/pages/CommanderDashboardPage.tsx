import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout, type ApiError, fetchJson, formatDateTime, formatStatus, statusClassName, type SibeSummary, type SibeVisitRow } from "../app/core";
import { Alert, Card, DataTable } from "../components/ui";

export function CommanderDashboardPage() {
  const [summary, setSummary] = useState<SibeSummary | null>(null);
  const [recentVisits, setRecentVisits] = useState<SibeVisitRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [summaryPayload, recentPayload] = await Promise.all([
          fetchJson<SibeSummary>("/api/sibe/summary", { method: "GET", headers: {} }),
          fetchJson<{ visits: SibeVisitRow[] }>("/api/sibe/visits?status=all", { method: "GET", headers: {} })
        ]);

        setSummary(summaryPayload);
        setRecentVisits(recentPayload.visits.slice(0, 120));
      } catch (apiError) {
        const errorPayload = apiError as ApiError;
        setError(errorPayload.message || "Die KasKdt-Übersicht konnte nicht geladen werden.");
      }
    }

    void loadDashboard();
  }, []);

  const currentVisits = useMemo(
    () => recentVisits
      .filter((visit) => visit.status === "checked_in")
      .slice(0, 8),
    [recentVisits]
  );
  const pastVisits = useMemo(
    () => recentVisits
      .filter((visit) => visit.status === "checked_out" || new Date(visit.validUntil) < new Date())
      .slice(0, 8),
    [recentVisits]
  );
  const upcomingVisits = useMemo(
    () => recentVisits
      .filter((visit) => visit.status === "pre_registered" && new Date(visit.validFrom) > new Date())
      .slice(0, 8),
    [recentVisits]
  );

  return (
    <AppLayout>
      <main className="page-panel page-shell-wide">
        <section className="page-hero">
          <div className="page-hero-grid dashboard-hero-grid">
            <div className="page-hero-content">
              <h2>KasKdt-Übersicht</h2>
            </div>
            <div className="hero-stat-grid">
              <div className="hero-stat-card">
                <span className="hero-stat-label">Besucher gesamt</span>
                <strong className="hero-stat-value">{summary?.visitorsTotal ?? "-"}</strong>
              </div>
              <div className="hero-stat-card">
                <span className="hero-stat-label">Heutige Besuche</span>
                <strong className="hero-stat-value">{summary?.todaysVisits ?? "-"}</strong>
              </div>
              <div className="hero-stat-card">
                <span className="hero-stat-label">Aktuell eingecheckt</span>
                <strong className="hero-stat-value">{summary?.checkedInVisitors ?? "-"}</strong>
              </div>
              <div className="hero-stat-card">
                <span className="hero-stat-label">Bestätigung fehlt</span>
                <strong className="hero-stat-value">{summary?.signaturesPending ?? "-"}</strong>
              </div>
              <div className="hero-stat-card">
                <span className="hero-stat-label">Ausnahmen</span>
                <strong className="hero-stat-value">{summary?.signaturesExceptions ?? "-"}</strong>
              </div>
            </div>
          </div>
        </section>

        {error ? <Alert type="error">{error}</Alert> : null}

        <div className="split-card-grid">
          <Card>
            <div className="section-header">
              <div>
                <h3>Gerade eingecheckt</h3>
              </div>
              <Link className="button-link" to="/kaskdt/besucher">Besucherübersicht</Link>
            </div>
            <DataTable>
              <thead>
                <tr>
                  <th>Besucher</th>
                  <th>Firma</th>
                  <th>Ansprechpartner</th>
                  <th>Wache</th>
                  <th>Check-in</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {currentVisits.length > 0 ? currentVisits.map((visit) => (
                  <tr key={visit.id}>
                    <td>{visit.visitorName}</td>
                    <td>{visit.company}</td>
                    <td>{visit.hostName}</td>
                    <td>{visit.gateName}</td>
                    <td>{formatDateTime(visit.checkInAt || visit.validFrom)}</td>
                    <td>
                      <Link className="button-link" to={`/kaskdt/besucher/${visit.id}`}>Details</Link>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6}>Keine aktuellen Besuche gefunden.</td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </Card>
        </div>

        <div className="split-card-grid">
          <Card>
            <div className="section-header">
              <div>
                <h3>Vergangene Besuche</h3>
              </div>
              <Link className="button-link" to="/kaskdt/besucher">Besucherübersicht</Link>
            </div>
            <DataTable>
              <thead>
                <tr>
                  <th>Besucher</th>
                  <th>Firma</th>
                  <th>Status</th>
                  <th>Gültig bis</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {pastVisits.length > 0 ? pastVisits.map((visit) => (
                  <tr key={visit.id}>
                    <td>{visit.visitorName}</td>
                    <td>{visit.company}</td>
                    <td><span className={statusClassName(visit.status)}>{formatStatus(visit.status)}</span></td>
                    <td>{formatDateTime(visit.validUntil)}</td>
                    <td>
                      <Link className="button-link" to={`/kaskdt/besucher/${visit.id}`}>Details</Link>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5}>Keine vergangenen Besuche gefunden.</td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </Card>
        </div>

        <div className="split-card-grid">
          <Card>
            <div className="section-header">
              <div>
                <h3>Kommende Besuche</h3>
              </div>
              <Link className="button-link" to="/kaskdt/besucher">Besucherübersicht</Link>
            </div>
            <DataTable>
              <thead>
                <tr>
                  <th>Besucher</th>
                  <th>Firma</th>
                  <th>Ansprechpartner</th>
                  <th>Wache</th>
                  <th>Gültig von</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {upcomingVisits.length > 0 ? upcomingVisits.map((visit) => (
                  <tr key={visit.id}>
                    <td>{visit.visitorName}</td>
                    <td>{visit.company}</td>
                    <td>{visit.hostName}</td>
                    <td>{visit.gateName}</td>
                    <td>{formatDateTime(visit.validFrom)}</td>
                    <td>
                      <Link className="button-link" to={`/kaskdt/besucher/${visit.id}`}>Details</Link>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6}>Keine kommenden Besuche gefunden.</td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </Card>
        </div>
      </main>
    </AppLayout>
  );
}
