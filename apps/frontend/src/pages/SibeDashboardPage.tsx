import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout, type ApiError, fetchJson, formatDateTime, formatSignatureStatus, formatStatus, statusClassName, type SibeSummary, type SibeVisitRow } from "../app/core";
import { Alert, Card, DataTable } from "../components/ui";

export function SibeDashboardPage() {
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
        setRecentVisits(recentPayload.visits.slice(0, 24));
      } catch (apiError) {
        const errorPayload = apiError as ApiError;
        setError(errorPayload.message || "Die Übersicht konnte nicht geladen werden.");
      }
    }

    void loadDashboard();
  }, []);

  const checkedInVisits = useMemo(
    () => recentVisits.filter((visit) => visit.status === "checked_in").slice(0, 8),
    [recentVisits]
  );
  const signatureFollowUps = useMemo(
    () => recentVisits
      .filter((visit) => visit.hostSignatureStatus === "pending" || visit.hostSignatureStatus === "signed_later" || visit.hostSignatureStatus === "missing_exception")
      .slice(0, 8),
    [recentVisits]
  );

  return (
    <AppLayout>
      <main className="page-panel page-shell-wide">
        <section className="page-hero">
          <div className="page-hero-grid dashboard-hero-grid">
            <div className="page-hero-content">
              <h2>SiBe-Übersicht</h2>
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
                <span className="hero-stat-label">Vergangene offen</span>
                <strong className="hero-stat-value">{summary?.signaturesFollowUp ?? "-"}</strong>
              </div>
              <div className="hero-stat-card">
                <span className="hero-stat-label">Ausnahmen</span>
                <strong className="hero-stat-value">{summary?.signaturesExceptions ?? "-"}</strong>
              </div>
              <div className="hero-stat-card">
                <span className="hero-stat-label">Freigaben offen</span>
                <strong className="hero-stat-value">{summary?.approvalsPending ?? "-"}</strong>
              </div>
            </div>
          </div>
        </section>

        {error ? <Alert type="error">{error}</Alert> : null}

        <div className="split-card-grid">
          <Card>
            <div className="section-header">
              <div>
                <h3>Besuche ohne Ansprechpartner-Bestätigung</h3>
                <p className="section-copy">Vergangene oder laufende Besuche, bei denen die Bestätigung noch fehlt.</p>
              </div>
              <Link className="button-link" to="/sibe/besucher">Besucherübersicht</Link>
            </div>
            <DataTable>
              <thead>
                <tr>
                  <th>Besucher</th>
                  <th>Firma</th>
                  <th>Status</th>
                  <th>Bestätigung</th>
                  <th>Gültig bis</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {signatureFollowUps.length > 0 ? signatureFollowUps.map((visit) => (
                  <tr key={visit.id}>
                    <td>{visit.visitorName}</td>
                    <td>{visit.company}</td>
                    <td><span className={statusClassName(visit.status)}>{formatStatus(visit.status)}</span></td>
                    <td>{formatSignatureStatus(visit.hostSignatureStatus)}</td>
                    <td>{formatDateTime(visit.validUntil)}</td>
                    <td>
                      <Link className="button-link" to={`/sibe/besucher/${visit.id}`}>Details</Link>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6}>Keine offenen Nachreichungen gefunden.</td>
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
