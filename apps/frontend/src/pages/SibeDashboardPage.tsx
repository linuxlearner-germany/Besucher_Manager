import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert } from "../components/ui";
import { AppLayout, type ApiError, fetchJson, type SibeSummary, useAuth } from "../app/core";

export function SibeDashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<SibeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSummary() {
      try {
        const payload = await fetchJson<SibeSummary>("/api/sibe/summary", { method: "GET", headers: {} });
        setSummary(payload);
      } catch (apiError) {
        const errorPayload = apiError as ApiError;
        setError(errorPayload.message || "SiBe-Dashboard konnte nicht geladen werden.");
      }
    }

    void loadSummary();
  }, []);

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-full admin-page-shell">
        <div className="section-header">
          <div>
            <h2>{user?.role === "kaskdt" ? "KasKdt Dashboard" : "SiBe Dashboard"}</h2>
          </div>
        </div>

        {error ? <Alert type="error">{error}</Alert> : null}

        <div className="card-grid stat-grid">
          <article className="panel mini-card"><h3>Besucher gesamt</h3><p>{summary?.visitorsTotal ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Aktive Besucher</h3><p>{summary?.activeVisitors ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Heutige Besuche</h3><p>{summary?.todaysVisits ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Aktuell eingecheckt</h3><p>{summary?.checkedInVisitors ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Unterschrift offen</h3><p>{summary?.signaturesPending ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Nachgereicht</h3><p>{summary?.signaturesFollowUp ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Ausnahmen</h3><p>{summary?.signaturesExceptions ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Benutzer gesamt</h3><p>{summary?.usersTotal ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Aktive Benutzer</h3><p>{summary?.activeUsers ?? "-"}</p></article>
        </div>

        <div className="row-actions">
          <Link className="button-link" to="/sibe/besucher">Besucher suchen</Link>
          <Link className="button-link" to="/sibe/benutzer">Benutzer suchen</Link>
          {user && (user.role === "kaskdt" || user.role === "admin") ? (
            <Link className="button-link" to="/kaskdt/texte">Texte verwalten</Link>
          ) : null}
        </div>
      </main>
    </AppLayout>
  );
}
