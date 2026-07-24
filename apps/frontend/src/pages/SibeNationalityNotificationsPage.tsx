import { useEffect, useMemo, useState } from "react";
import { AppLayout, type ApiError, fetchJson } from "../app/core";
import { Alert, Card } from "../components/ui";
import { useCountries } from "../components/CountrySelect";

export function SibeNationalityNotificationsPage() {
  const countries = useCountries();
  const [countrySearch, setCountrySearch] = useState("");
  const [countryCodes, setCountryCodes] = useState<string[]>([]);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetchJson<{ countryCodes: string[]; email: string | null }>("/api/sibe/nationality-subscriptions", { method: "GET", headers: {} })
      .then((payload) => {
        setCountryCodes(payload.countryCodes);
        setAccountEmail(payload.email);
      })
      .catch((apiError: ApiError) => setError(apiError.message || "Die Länderabonnements konnten nicht geladen werden."));
  }, []);

  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLocaleLowerCase("de");
    return query
      ? countries.filter((country) => `${country.name} ${country.code}`.toLocaleLowerCase("de").includes(query))
      : countries;
  }, [countries, countrySearch]);

  async function saveSubscriptions() {
    setSaved(false);
    try {
      await fetchJson("/api/sibe/nationality-subscriptions", { method: "PUT", body: JSON.stringify({ countryCodes }) });
      setSaved(true);
    } catch (apiError) {
      setError((apiError as ApiError).message || "Die Länderabonnements konnten nicht gespeichert werden.");
    }
  }

  return (
    <AppLayout>
      <main className="page-panel page-shell-wide">
        <section className="page-hero"><div className="page-hero-content"><h2>Länderbenachrichtigungen</h2><p>Wählen Sie die Nationalitäten aus, für die Sie je Besuch eine E-Mail erhalten möchten.</p></div></section>
        {error ? <Alert type="error">{error}</Alert> : null}
        <Card className="country-notification-card">
          {!accountEmail ? <Alert type="warning">Für Ihr Benutzerkonto ist keine E-Mail-Adresse hinterlegt. Benachrichtigungen können nicht zugestellt werden.</Alert> : <p className="muted">Benachrichtigungen an: {accountEmail}</p>}
          {saved ? <Alert type="success">Länderauswahl gespeichert.</Alert> : null}
          <div className="toolbar filter-bar">
            <input placeholder="Land oder Code suchen" value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} />
            <button type="button" className="secondary-button" onClick={() => setCountryCodes(countries.map((country) => country.code))}>Alle auswählen</button>
            <button type="button" className="secondary-button" onClick={() => setCountryCodes([])}>Alle abwählen</button>
            <button type="button" onClick={() => void saveSubscriptions()}>Speichern</button>
          </div>
          <div className="country-checklist">
            {filteredCountries.map((country) => <label key={country.code} className="checkbox-line"><input type="checkbox" checked={countryCodes.includes(country.code)} onChange={(event) => setCountryCodes((current) => event.target.checked ? Array.from(new Set([...current, country.code])) : current.filter((code) => code !== country.code))} /><span>{country.name} ({country.code})</span></label>)}
          </div>
        </Card>
      </main>
    </AppLayout>
  );
}
