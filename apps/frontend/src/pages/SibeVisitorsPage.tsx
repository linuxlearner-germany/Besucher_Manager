import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Card, DataTable, FormField } from "../components/ui";
import {
  AppLayout,
  type ApiError,
  fetchJson,
  formatDateOnly,
  formatDateTime,
  formatSignatureStatus,
  formatStatus,
  statusClassName,
  toDateInputValue,
  type SibeVisitRow,
  type SibeVisitorRow,
  useAuth
} from "../app/core";

export function SibeVisitorsPage() {
  const { user } = useAuth();
  const isCommanderView = user?.role === "kaskdt";
  const [visits, setVisits] = useState<SibeVisitRow[]>([]);
  const [visitors, setVisitors] = useState<SibeVisitorRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("");
  const [hostFilter, setHostFilter] = useState("");
  const [gateFilter, setGateFilter] = useState("");
  const [licensePlateFilter, setLicensePlateFilter] = useState("");
  const [badgeFilter, setBadgeFilter] = useState("");
  const [exportDate, setExportDate] = useState(() => toDateInputValue(new Date()));
  const filteredVisitCount = visits.length;
  const filteredVisitorCount = visitors.length;
  const checkedInCount = visits.filter((visit) => visit.status === "checked_in").length;

  function applyRangePreset(preset: "today" | "yesterday" | "week" | "last7" | "month") {
    const now = new Date();
    const end = new Date(now);
    let start = new Date(now);
    if (preset === "today") {
    } else if (preset === "yesterday") {
      start.setDate(now.getDate() - 1);
      end.setDate(now.getDate() - 1);
    } else if (preset === "week") {
      const day = (now.getDay() + 6) % 7;
      start.setDate(now.getDate() - day);
    } else if (preset === "last7") {
      start.setDate(now.getDate() - 6);
    } else if (preset === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    setDateFrom(toDateInputValue(start));
    setDateTo(toDateInputValue(end));
  }

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const visitParams = new URLSearchParams();
      if (search) visitParams.set("search", search);
      if (status) visitParams.set("status", status);
      if (dateFrom) visitParams.set("from", dateFrom);
      if (dateTo) visitParams.set("to", dateTo);
      if (companyFilter) visitParams.set("company", companyFilter);
      if (hostFilter) visitParams.set("hostName", hostFilter);
      if (gateFilter) visitParams.set("gate", gateFilter);
      if (licensePlateFilter) visitParams.set("licensePlate", licensePlateFilter);
      if (badgeFilter) visitParams.set("badgeNumber", badgeFilter);

      const [visitPayload, visitorPayload] = await Promise.all([
        fetchJson<{ visits: SibeVisitRow[] }>(`/api/sibe/visits?${visitParams.toString()}`, { method: "GET", headers: {} }),
        fetchJson<{ visitors: SibeVisitorRow[] }>(`/api/sibe/visitors?${visitParams.toString()}`, { method: "GET", headers: {} })
      ]);
      setVisits(visitPayload.visits);
      setVisitors(visitorPayload.visitors);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Besucher konnten nicht geladen werden.");
    }
  }, [badgeFilter, companyFilter, dateFrom, dateTo, gateFilter, hostFilter, licensePlateFilter, search, status]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function downloadExport(range: "day" | "week" | "month" | "all") {
    const params = new URLSearchParams({ range, date: exportDate });
    window.location.href = `/api/sibe/visits/export?${params.toString()}`;
  }

  function resetFilters() {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setStatus("all");
    setCompanyFilter("");
    setHostFilter("");
    setGateFilter("");
    setLicensePlateFilter("");
    setBadgeFilter("");
  }

  return (
    <AppLayout>
      <main className="page-panel page-shell-wide">
        <section className="page-hero">
          <div className="page-hero-grid">
            <div className="page-hero-content">
              <h2>{isCommanderView ? "Besucherübersicht" : "SiBe Besucherübersicht"}</h2>
            </div>
            <div className="hero-stat-grid">
              <div className="hero-stat-card">
                <span className="hero-stat-label">Besuche</span>
                <strong className="hero-stat-value">{filteredVisitCount}</strong>
              </div>
              <div className="hero-stat-card">
                <span className="hero-stat-label">Besucher</span>
                <strong className="hero-stat-value">{filteredVisitorCount}</strong>
              </div>
              <div className="hero-stat-card">
                <span className="hero-stat-label">Eingecheckt</span>
                <strong className="hero-stat-value">{checkedInCount}</strong>
              </div>
            </div>
          </div>
        </section>

        <Card className="filter-panel">
          <div className="section-header">
            <div>
              <h3>Filter</h3>
            </div>
            <div className="row-actions">
              <button type="button" className="secondary-button" onClick={() => void loadData()}>Aktualisieren</button>
              <button type="button" className="secondary-button" onClick={resetFilters}>Zurücksetzen</button>
            </div>
          </div>

          <div className="toolbar-search filter-search-row">
            <input
              placeholder="Name, Firma, Ansprechpartner, Kennzeichen oder Besuchsnummer"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="filter-grid">
            <FormField label="Status">
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">Alle</option>
                <option value="pre_registered">Vorangemeldet</option>
                <option value="checked_in">Eingecheckt</option>
                <option value="checked_out">Ausgecheckt</option>
                <option value="cancelled">Storniert</option>
                <option value="overdue">Überfällig</option>
              </select>
            </FormField>
            <FormField label="Von">
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </FormField>
            <FormField label="Bis">
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </FormField>
            <FormField label="Firma">
              <input value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} />
            </FormField>
            <FormField label="Ansprechpartner">
              <input value={hostFilter} onChange={(event) => setHostFilter(event.target.value)} />
            </FormField>
            <FormField label="Wache">
              <input value={gateFilter} onChange={(event) => setGateFilter(event.target.value)} />
            </FormField>
            <FormField label="Kennzeichen">
              <input value={licensePlateFilter} onChange={(event) => setLicensePlateFilter(event.target.value)} />
            </FormField>
            <FormField label="Besuchsnummer">
              <input value={badgeFilter} onChange={(event) => setBadgeFilter(event.target.value)} />
            </FormField>
          </div>

          <div className="toolbar filter-bar preset-row">
            <button type="button" className="secondary-button" onClick={() => applyRangePreset("today")}>Heute</button>
            <button type="button" className="secondary-button" onClick={() => applyRangePreset("yesterday")}>Gestern</button>
            <button type="button" className="secondary-button" onClick={() => applyRangePreset("week")}>Diese Woche</button>
            <button type="button" className="secondary-button" onClick={() => applyRangePreset("last7")}>Letzte 7 Tage</button>
            <button type="button" className="secondary-button" onClick={() => applyRangePreset("month")}>Dieser Monat</button>
            <button type="button" className="secondary-button" onClick={() => { setDateFrom(""); setDateTo(""); }}>Zeitraum löschen</button>
          </div>
        </Card>

        {error ? <Alert type="error">{error}</Alert> : null}

        {!isCommanderView ? (
          <Card>
            <h3>Export</h3>
            <div className="toolbar filter-bar import-export-bar">
              <Link className="button-link" to="/import">Import öffnen</Link>
              <input type="date" value={exportDate} onChange={(event) => setExportDate(event.target.value)} />
              <button type="button" className="secondary-button" onClick={() => downloadExport("day")}>Tagesexport</button>
              <button type="button" className="secondary-button" onClick={() => downloadExport("week")}>Wochenexport</button>
              <button type="button" className="secondary-button" onClick={() => downloadExport("month")}>Monatsexport</button>
              <button type="button" className="secondary-button" onClick={() => downloadExport("all")}>Gesamtübersicht</button>
            </div>
          </Card>
        ) : null}

        <Card>
          <h3>Besuchsvorgaenge</h3>
          <DataTable>
            <thead>
              <tr>
                <th>Besuchername</th>
                <th>Firma</th>
                <th>Nationalität</th>
                <th>Nationalität</th>
                <th>Kennzeichen</th>
                <th>Besuchsnummer</th>
                <th>Status</th>
                <th>Wache</th>
                <th>Ansprechpartner</th>
                <th>Gültig von</th>
                <th>Gültig bis</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Unterschrift</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((visit) => (
                <tr key={visit.id}>
                  <td>{visit.visitorName}</td>
                  <td>{visit.company}</td>
                  <td>{visit.nationalityName || visit.nationalityCode || "-"}</td>
                  <td>{visit.licensePlate || "-"}</td>
                  <td>{visit.badgeNumber || visit.id.slice(0, 8).toUpperCase()}</td>
                  <td><span className={statusClassName(visit.status)}>{formatStatus(visit.status)}</span></td>
                  <td>{visit.gateName}</td>
                  <td>{visit.hostName}</td>
                  <td>{formatDateOnly(visit.validFrom)}</td>
                  <td>{formatDateOnly(visit.validUntil)}</td>
                  <td>{formatDateTime(visit.checkInAt)}</td>
                  <td>{formatDateTime(visit.checkOutAt)}</td>
                  <td>{formatSignatureStatus(visit.hostSignatureStatus)}</td>
                  <td>
                    <Link className="button-link" to={`${isCommanderView ? "/kaskdt/besucher" : "/sibe/besucher"}/${visit.id}`}>
                      {isCommanderView ? "Ansehen" : "Details"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card>
          <h3>Besucher</h3>
          <DataTable>
            <thead>
              <tr>
                <th>Name</th>
                <th>Geburtsdatum</th>
                <th>Firma</th>
                <th>Telefon</th>
                <th>E-Mail</th>
                <th>Besuche</th>
                <th>Letzter Besuch</th>
                <th>Archiviert</th>
              </tr>
            </thead>
            <tbody>
              {visitors.map((visitor) => (
                <tr key={visitor.id}>
                  <td>{visitor.firstName} {visitor.lastName}</td>
                  <td>{formatDateOnly(visitor.birthDate)}</td>
                  <td>{visitor.company}</td>
                  <td>{visitor.nationalityName || visitor.nationalityCode || "-"}</td>
                  <td>{visitor.phone || "-"}</td>
                  <td>{visitor.email || "-"}</td>
                  <td>{visitor.visitCount}</td>
                  <td>{formatDateTime(visitor.lastVisitAt)}</td>
                  <td>{formatDateTime(visitor.archivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

      </main>
    </AppLayout>
  );
}
