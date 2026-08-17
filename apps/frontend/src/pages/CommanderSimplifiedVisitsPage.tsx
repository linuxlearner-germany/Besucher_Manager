import { useEffect, useState } from "react";
import { AppLayout, fetchJson, formatDateOnly, formatStatus, type Gate } from "../app/core";

type Row = { id: string; firstName: string | null; lastName: string | null; company: string | null; hostName: string | null; purpose: string | null; gateName: string | null; status: string; source: string; validFrom: string; validUntil: string; createdAt: string };

export function CommanderSimplifiedVisitsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [gateId, setGateId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [gates, setGates] = useState<Gate[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const query = new URLSearchParams({ page: String(page), pageSize: "25", search, status, sortBy, sortDirection: "desc", gateId, from, to });
    void fetchJson<{ visits: Row[]; total: number }>(`/api/kaskdt/simplified-visits?${query}`).then((payload) => { setRows(payload.visits); setTotal(payload.total); setError(""); }).catch((reason) => setError(reason?.message ?? "Liste konnte nicht geladen werden."));
  }, [page, search, status, sortBy, gateId, from, to]);
  useEffect(() => { void fetchJson<{ gates: Gate[] }>("/api/public/gates").then((payload) => setGates(payload.gates)).catch(() => undefined); }, []);
  const none = (value: string | null) => value?.trim() || "Keine Angabe";
  return <AppLayout><main className="page-panel page-shell-wide"><section className="page-hero"><h2>Vereinfachte Besucher</h2><p>Bereits erfasste und genehmigte Besuche der vereinfachten Besucherregelung.</p></section>
    {error ? <div className="feedback error">{error}</div> : null}
    <div className="filter-bar"><input aria-label="Suche" placeholder="Suche" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><select aria-label="Wache" value={gateId} onChange={(event) => { setGateId(event.target.value); setPage(1); }}><option value="">Alle Wachen</option>{gates.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}</select><select aria-label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Alle Status</option><option value="pre_registered">Vorangemeldet</option><option value="checked_in">Eingecheckt</option><option value="checked_out">Ausgecheckt</option></select><label>Von<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label><label>Bis<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label><select aria-label="Sortierung" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="createdAt">Neueste zuerst</option><option value="validFrom">Gültigkeit</option><option value="name">Name</option><option value="gate">Wache</option><option value="status">Status</option></select></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Firma</th><th>Wache</th><th>Status</th><th>Zeitraum</th><th>Ansprechpartner</th><th>Zweck</th><th>Quelle</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{none([row.firstName, row.lastName].filter(Boolean).join(" "))}</td><td>{none(row.company)}</td><td>{none(row.gateName)}</td><td>{formatStatus(row.status)}</td><td>{formatDateOnly(row.validFrom)}–{formatDateOnly(row.validUntil)}</td><td>{none(row.hostName)}</td><td>{none(row.purpose)}</td><td>{row.source === "public_simplified_excel" ? "Öffentlicher Antrag" : row.source === "simplified_excel" ? "Interner XLSX-Import" : "Web"}</td></tr>)}</tbody></table></div>
    <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Zurück</button><span>Seite {page} · {total} Einträge</span><button disabled={page * 25 >= total} onClick={() => setPage((value) => value + 1)}>Weiter</button></div>
  </main></AppLayout>;
}
