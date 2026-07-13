import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Card, DataTable, FormField } from "../components/ui";
import {
  AppLayout,
  type ApiError,
  extractFieldErrors,
  fetchJson,
  formatDateOnly,
  formatApprovalStatus,
  type SibeSummary,
  type SibeVisitRow
} from "../app/core";

function isExpiredDocument(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const documentValidUntil = new Date(`${value}T23:59:59.999Z`);
  return !Number.isNaN(documentValidUntil.getTime()) && documentValidUntil < new Date();
}

export function ApprovalQueuePage() {
  const [visits, setVisits] = useState<SibeVisitRow[]>([]);
  const [summary, setSummary] = useState<SibeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hostFilter, setHostFilter] = useState("");
  const [gateFilter, setGateFilter] = useState("");
  const [approvalNotes, setApprovalNotes] = useState<Record<string, string>>({});
  const [savingVisitId, setSavingVisitId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        approvalStatus: "pending",
        status: "pre_registered"
      });

      if (search.trim()) params.set("search", search.trim());
      if (hostFilter.trim()) params.set("hostName", hostFilter.trim());
      if (gateFilter.trim()) params.set("gate", gateFilter.trim());

      const [summaryPayload, visitsPayload] = await Promise.all([
        fetchJson<SibeSummary>("/api/sibe/summary", { method: "GET", headers: {} }),
        fetchJson<{ visits: SibeVisitRow[] }>(`/api/sibe/visits?${params.toString()}`, { method: "GET", headers: {} })
      ]);

      setSummary(summaryPayload);
      setVisits(visitsPayload.visits);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Die Genehmigungen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [gateFilter, hostFilter, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const overdueCount = useMemo(() => visits.filter((visit) => new Date(visit.validUntil) < new Date()).length, [visits]);
  const expiredDocumentCount = useMemo(() => visits.filter((visit) => isExpiredDocument(visit.idDocumentValidUntil)).length, [visits]);

  async function handleDecision(visitId: string, status: "approved" | "rejected") {
    const note = approvalNotes[visitId]?.trim() || "";

    if (status === "rejected" && !note) {
      setError("Bitte einen Hinweis für die Ablehnung eintragen.");
      setMessage(null);
      return;
    }

    setSavingVisitId(visitId);
    setError(null);
    setMessage(null);

    try {
      await fetchJson(`/api/sibe/visits/${visitId}/approval`, {
        method: "PUT",
        body: JSON.stringify({
          status,
          note
        })
      });
      setMessage(status === "approved" ? "Besuch freigegeben." : "Besuch abgelehnt.");
      setApprovalNotes((current) => ({ ...current, [visitId]: "" }));
      await loadData();
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      const fieldErrors = extractFieldErrors(errorPayload);
      setError(fieldErrors.note || errorPayload.message || "Die Entscheidung konnte nicht gespeichert werden.");
    } finally {
      setSavingVisitId(null);
    }
  }

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
        <div className="section-header">
          <div>
            <h2>Genehmigungen</h2>
          </div>
        </div>

        {message ? <Alert type="success">{message}</Alert> : null}
        {error ? <Alert type="error">{error}</Alert> : null}

        <div className="card-grid stat-grid approval-stat-grid">
          <article className="panel mini-card approval-mini-card"><h3>Offen</h3><p>{summary?.approvalsPending ?? "-"}</p></article>
          <article className="panel mini-card approval-mini-card"><h3>In Liste</h3><p>{visits.length}</p></article>
          <article className="panel mini-card approval-mini-card"><h3>Überfällig</h3><p>{overdueCount}</p></article>
          <article className="panel mini-card approval-mini-card"><h3>Ausweis abgelaufen</h3><p>{expiredDocumentCount}</p></article>
        </div>

        <Card className="filter-panel">
          <div className="section-header">
            <div>
              <h3>Filter</h3>
            </div>
            <div className="row-actions approval-filter-actions">
              <button type="button" className="secondary-button" onClick={() => void loadData()}>Aktualisieren</button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSearch("");
                  setHostFilter("");
                  setGateFilter("");
                }}
              >
                Zurücksetzen
              </button>
            </div>
          </div>
          <div className="filter-grid">
            <FormField label="Suche">
              <input
                placeholder="Besucher, Firma, Ansprechpartner oder Kennzeichen"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </FormField>
            <FormField label="Ansprechpartner">
              <input
                value={hostFilter}
                onChange={(event) => setHostFilter(event.target.value)}
              />
            </FormField>
            <FormField label="Wache">
              <input
                value={gateFilter}
                onChange={(event) => setGateFilter(event.target.value)}
              />
            </FormField>
          </div>
        </Card>

        {loading ? <Alert type="info">Genehmigungen werden geladen...</Alert> : null}

        {!loading ? (
          <div className="table-section approval-table-shell">
          <div className="table-section-header">
            <div>
              <h3>Offene Freigaben</h3>
            </div>
          </div>
            <DataTable>
              <thead>
                <tr>
                  <th>Freigabe</th>
                  <th>Besucher</th>
                  <th>Firma</th>
                  <th>Ansprechpartner</th>
                  <th>Wache</th>
                  <th>Gültig von</th>
                  <th>Gültig bis</th>
                  <th>Warnung</th>
                  <th>Hinweis</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {visits.length ? visits.map((visit) => (
                  <tr key={visit.id}>
                    <td className="cell-nowrap">{formatApprovalStatus(visit.approvalStatus)}</td>
                    <td>{visit.visitorName}</td>
                    <td>{visit.company}</td>
                    <td>{visit.hostName}</td>
                    <td className="cell-nowrap">{visit.gateName}</td>
                    <td className="cell-nowrap">{formatDateOnly(visit.validFrom)}</td>
                    <td className="cell-nowrap">{formatDateOnly(visit.validUntil)}</td>
                    <td>
                      {isExpiredDocument(visit.idDocumentValidUntil) ? (
                        <span className="feedback warning compact-feedback">Ausweis abgelaufen</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <input
                        className="approval-note-input"
                        placeholder="Hinweis für Freigabe oder Ablehnung"
                        value={approvalNotes[visit.id] ?? ""}
                        onChange={(event) => setApprovalNotes((current) => ({ ...current, [visit.id]: event.target.value }))}
                      />
                    </td>
                    <td className="actions-cell">
                      <div className="action-row approval-action-row">
                        <button
                          type="button"
                          disabled={savingVisitId === visit.id}
                          onClick={() => void handleDecision(visit.id, "approved")}
                        >
                          {savingVisitId === visit.id ? "Speichert..." : "Freigeben"}
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={savingVisitId === visit.id}
                          onClick={() => void handleDecision(visit.id, "rejected")}
                        >
                          Ablehnen
                        </button>
                        <Link className="button-link" to={`/sibe/besucher/${visit.id}`}>Prüfen</Link>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={10}>Keine offenen Genehmigungen gefunden.</td>
                  </tr>
                )}
              </tbody>
            </DataTable>
          </div>
        ) : null}
      </main>
    </AppLayout>
  );
}
