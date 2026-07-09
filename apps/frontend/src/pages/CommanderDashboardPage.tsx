import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AppLayout,
  type ApiError,
  fetchJson,
  formatDateTime,
  formatSignatureStatus,
  formatStatus,
  statusClassName,
  type SibeSummary,
  type SibeVisitRow
} from "../app/core";
import { Alert, Card, DataTable } from "../components/ui";

function startOfTodayIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

function endOfTodayIso(): string {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return end.toISOString();
}

export function CommanderDashboardPage() {
  const [summary, setSummary] = useState<SibeSummary | null>(null);
  const [todaysVisits, setTodaysVisits] = useState<SibeVisitRow[]>([]);
  const [recentVisits, setRecentVisits] = useState<SibeVisitRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const from = startOfTodayIso();
        const to = endOfTodayIso();
        const [summaryPayload, todayPayload, recentPayload] = await Promise.all([
          fetchJson<SibeSummary>("/api/sibe/summary", { method: "GET", headers: {} }),
          fetchJson<{ visits: SibeVisitRow[] }>(`/api/sibe/visits?status=all&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { method: "GET", headers: {} }),
          fetchJson<{ visits: SibeVisitRow[] }>("/api/sibe/visits?status=all", { method: "GET", headers: {} })
        ]);

        setSummary(summaryPayload);
        setTodaysVisits(todayPayload.visits);
        setRecentVisits(recentPayload.visits.slice(0, 80));
      } catch (apiError) {
        const errorPayload = apiError as ApiError;
        setError(errorPayload.message || "Die Kasernenkommandant-Übersicht konnte nicht geladen werden.");
      }
    }

    void loadDashboard();
  }, []);

  const preRegisteredToday = useMemo(
    () => todaysVisits.filter((visit) => visit.status === "pre_registered").length,
    [todaysVisits]
  );
  const checkedOutToday = useMemo(
    () => todaysVisits.filter((visit) => visit.status === "checked_out").length,
    [todaysVisits]
  );
  const currentSituation = useMemo(
    () => recentVisits
      .filter((visit) => visit.status === "checked_in" || visit.status === "pre_registered")
      .slice(0, 12),
    [recentVisits]
  );
  const signatureFollowUps = useMemo(
    () => recentVisits
      .filter((visit) => visit.hostSignatureStatus === "pending" || visit.hostSignatureStatus === "signed_later" || visit.hostSignatureStatus === "missing_exception")
      .slice(0, 12),
    [recentVisits]
  );
  const gateOverview = useMemo(() => {
    const byGate = new Map<string, { gateName: string; checkedIn: number; preRegistered: number; checkedOut: number }>();

    for (const visit of todaysVisits) {
      const key = visit.gateName || "Noch nicht zugeordnet";
      const current = byGate.get(key) ?? { gateName: key, checkedIn: 0, preRegistered: 0, checkedOut: 0 };
      if (visit.status === "checked_in") current.checkedIn += 1;
      if (visit.status === "pre_registered") current.preRegistered += 1;
      if (visit.status === "checked_out") current.checkedOut += 1;
      byGate.set(key, current);
    }

    return Array.from(byGate.values()).sort((left, right) => right.checkedIn - left.checkedIn || right.preRegistered - left.preRegistered || left.gateName.localeCompare(right.gateName));
  }, [todaysVisits]);

  return (
    <AppLayout>
      <main className="page-panel page-shell-wide">
        <section className="page-hero">
          <div className="page-hero-grid dashboard-hero-grid">
            <div className="page-hero-content">
              <h2>Kasernenkommandant-Übersicht</h2>
            </div>
            <div className="hero-stat-grid">
              <div className="hero-stat-card"><span className="hero-stat-label">Besucher gesamt</span><strong className="hero-stat-value">{summary?.visitorsTotal ?? "-"}</strong></div>
              <div className="hero-stat-card"><span className="hero-stat-label">Heutige Besuche</span><strong className="hero-stat-value">{summary?.todaysVisits ?? "-"}</strong></div>
              <div className="hero-stat-card"><span className="hero-stat-label">Aktuell eingecheckt</span><strong className="hero-stat-value">{summary?.checkedInVisitors ?? "-"}</strong></div>
              <div className="hero-stat-card"><span className="hero-stat-label">Vorangemeldet heute</span><strong className="hero-stat-value">{preRegisteredToday}</strong></div>
              <div className="hero-stat-card"><span className="hero-stat-label">Ausgecheckt heute</span><strong className="hero-stat-value">{checkedOutToday}</strong></div>
              <div className="hero-stat-card"><span className="hero-stat-label">Bestätigung fehlt</span><strong className="hero-stat-value">{summary?.signaturesPending ?? "-"}</strong></div>
              <div className="hero-stat-card"><span className="hero-stat-label">Vergangene offen</span><strong className="hero-stat-value">{summary?.signaturesFollowUp ?? "-"}</strong></div>
              <div className="hero-stat-card"><span className="hero-stat-label">Ausnahmen</span><strong className="hero-stat-value">{summary?.signaturesExceptions ?? "-"}</strong></div>
              <div className="hero-stat-card"><span className="hero-stat-label">Freigaben offen</span><strong className="hero-stat-value">{summary?.approvalsPending ?? "-"}</strong></div>
            </div>
          </div>
        </section>

        {error ? <Alert type="error">{error}</Alert> : null}

        <div className="split-card-grid">
          <Card>
            <div className="section-header">
              <div>
                <h3>Aktuelle Besuchslage</h3>
              </div>
              <Link className="button-link" to="/kaskdt/besucher">Besucherübersicht öffnen</Link>
            </div>
            <DataTable>
              <thead>
                <tr>
                  <th>Besucher</th>
                  <th>Firma</th>
                  <th>Ansprechpartner</th>
                  <th>Wache</th>
                  <th>Status</th>
                  <th>Gültig bis</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {currentSituation.length > 0 ? currentSituation.map((visit) => (
                  <tr key={visit.id}>
                    <td>{visit.visitorName}</td>
                    <td>{visit.company}</td>
                    <td>{visit.hostName}</td>
                    <td>{visit.gateName}</td>
                    <td><span className={statusClassName(visit.status)}>{formatStatus(visit.status)}</span></td>
                    <td>{formatDateTime(visit.validUntil)}</td>
                    <td><Link className="button-link" to={`/kaskdt/besucher/${visit.id}`}>Details anzeigen</Link></td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7}>Keine aktuellen Lageeinträge gefunden.</td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </Card>

          <Card>
            <div className="section-header">
              <div>
                <h3>Besuche ohne Ansprechpartner-Bestätigung</h3>
              </div>
              <Link className="button-link" to="/kaskdt/besucher">Besucherübersicht öffnen</Link>
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
                    <td><Link className="button-link" to={`/kaskdt/besucher/${visit.id}`}>Details anzeigen</Link></td>
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

        <Card>
          <div className="section-header">
            <div>
              <h3>Übersicht nach Wache</h3>
            </div>
          </div>
          <DataTable>
            <thead>
              <tr>
                <th>Wache</th>
                <th>Aktuell eingecheckt</th>
                <th>Heute vorgemeldet</th>
                <th>Heute ausgecheckt</th>
              </tr>
            </thead>
            <tbody>
              {gateOverview.length > 0 ? gateOverview.map((gate) => (
                <tr key={gate.gateName}>
                  <td>{gate.gateName}</td>
                  <td>{gate.checkedIn}</td>
                  <td>{gate.preRegistered}</td>
                  <td>{gate.checkedOut}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4}>Für heute liegen noch keine Wachenwerte vor.</td>
                </tr>
              )}
            </tbody>
          </DataTable>
        </Card>
      </main>
    </AppLayout>
  );
}
