import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout, type ApiError, fetchJson, formatDateTime, formatStatus, statusClassName, type SibeSummary, type SibeVisitRow } from "../app/core";
import { Alert, Card, DataTable } from "../components/ui";
import { useCountries } from "../components/CountrySelect";

export function SibeDashboardPage() {
  const [summary, setSummary] = useState<SibeSummary | null>(null);
  const [recentVisits, setRecentVisits] = useState<SibeVisitRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const countries = useCountries();
  const [countrySearch, setCountrySearch] = useState("");
  const [countryCodes, setCountryCodes] = useState<string[]>([]);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [subscriptionsSaved, setSubscriptionsSaved] = useState(false);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [summaryPayload, recentPayload, subscriptionPayload] = await Promise.all([
          fetchJson<SibeSummary>("/api/sibe/summary", { method: "GET", headers: {} }),
          fetchJson<{ visits: SibeVisitRow[] }>("/api/sibe/visits?status=all", { method: "GET", headers: {} }),
          fetchJson<{ countryCodes: string[]; email: string | null }>("/api/sibe/nationality-subscriptions", { method: "GET", headers: {} })
        ]);

        setSummary(summaryPayload);
        setRecentVisits(recentPayload.visits.slice(0, 120));
        setCountryCodes(subscriptionPayload.countryCodes);
        setAccountEmail(subscriptionPayload.email);
      } catch (apiError) {
        const errorPayload = apiError as ApiError;
        setError(errorPayload.message || "Die Übersicht konnte nicht geladen werden.");
      }
    }

    void loadDashboard();
  }, []);

  const pastVisits = useMemo(
    () => recentVisits
      .filter((visit) => visit.status === "checked_out" || new Date(visit.validUntil) < new Date())
      .slice(0, 8),
    [recentVisits]
  );
  const currentVisits = useMemo(
    () => recentVisits
      .filter((visit) => visit.status === "checked_in")
      .slice(0, 8),
    [recentVisits]
  );
  const upcomingVisits = useMemo(
    () => recentVisits
      .filter((visit) => visit.status === "pre_registered" && new Date(visit.validFrom) > new Date())
      .slice(0, 8),
    [recentVisits]
  );
  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLocaleLowerCase("de");
    return query ? countries.filter((country) => `${country.name} ${country.code}`.toLocaleLowerCase("de").includes(query)) : countries;
  }, [countries, countrySearch]);

  async function saveSubscriptions() {
    setSubscriptionsSaved(false);
    try {
      await fetchJson("/api/sibe/nationality-subscriptions", {
        method: "PUT",
        body: JSON.stringify({ countryCodes })
      });
      setSubscriptionsSaved(true);
    } catch (apiError) {
      setError((apiError as ApiError).message || "Die Länderabonnements konnten nicht gespeichert werden.");
    }
  }

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
                <span className="hero-stat-label">Ausnahmen</span>
                <strong className="hero-stat-value">{summary?.signaturesExceptions ?? "-"}</strong>
              </div>
            </div>
          </div>
        </section>

        {error ? <Alert type="error">{error}</Alert> : null}

        <Card>
          <div className="section-header">
            <div>
              <h3>Länderbenachrichtigungen</h3>
              <p>Sie erhalten je Besuch eine E-Mail, wenn dessen Nationalität zu Ihrer Auswahl gehört.</p>
            </div>
          </div>
          {!accountEmail ? <Alert type="warning">Für Ihr Benutzerkonto ist keine E-Mail-Adresse hinterlegt. Benachrichtigungen können nicht zugestellt werden.</Alert> : null}
          {subscriptionsSaved ? <Alert type="success">Länderauswahl gespeichert.</Alert> : null}
          <div className="toolbar filter-bar">
            <input placeholder="Land oder Code suchen" value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} />
            <button type="button" className="secondary-button" onClick={() => setCountryCodes(countries.map((country) => country.code))}>Alle auswählen</button>
            <button type="button" className="secondary-button" onClick={() => setCountryCodes([])}>Alle abwählen</button>
            <button type="button" onClick={() => void saveSubscriptions()}>Speichern</button>
          </div>
          <div className="country-checklist">
            {filteredCountries.map((country) => (
              <label key={country.code} className="checkbox-line">
                <input
                  type="checkbox"
                  checked={countryCodes.includes(country.code)}
                  onChange={(event) => setCountryCodes((current) => event.target.checked
                    ? Array.from(new Set([...current, country.code]))
                    : current.filter((code) => code !== country.code))}
                />
                <span>{country.name} ({country.code})</span>
              </label>
            ))}
          </div>
        </Card>

        <div className="split-card-grid">
          <Card>
            <div className="section-header">
              <div>
                <h3>Aktuelle Besuche</h3>
              </div>
              <Link className="button-link" to="/sibe/besucher">Besucherübersicht</Link>
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
                      <Link className="button-link" to={`/sibe/besucher/${visit.id}`}>Details</Link>
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
              <Link className="button-link" to="/sibe/besucher">Besucherübersicht</Link>
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
                      <Link className="button-link" to={`/sibe/besucher/${visit.id}`}>Details</Link>
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
              <Link className="button-link" to="/sibe/besucher">Besucherübersicht</Link>
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
                      <Link className="button-link" to={`/sibe/besucher/${visit.id}`}>Details</Link>
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
