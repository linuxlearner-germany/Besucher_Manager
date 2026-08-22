import { useEffect, useState } from "react";
import { AppLayout, type AdminGate, type ApiError, fetchJson } from "../app/core";
import { Alert, Card, FormField } from "../components/ui";

type Area = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  gates: Array<{ id: string; name: string; isActive: boolean }>;
};

export function BarracksAreasAdminPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [areaPayload, gatePayload] = await Promise.all([
        fetchJson<{ areas: Area[] }>("/api/admin/barracks-areas", { method: "GET", headers: {} }),
        fetchJson<{ gates: AdminGate[] }>("/api/admin/gates", { method: "GET", headers: {} })
      ]);
      setAreas(areaPayload.areas);
      setGates(gatePayload.gates);
      setError(null);
    } catch (caught) {
      setError((caught as ApiError).message || "Stammdaten konnten nicht geladen werden.");
    }
  }

  useEffect(() => { void load(); }, []);

  async function create() {
    try {
      await fetchJson("/api/admin/barracks-areas", { method: "POST", body: JSON.stringify({ name, description }) });
      setName("");
      setDescription("");
      await load();
    } catch (caught) {
      setError((caught as ApiError).message || "Kasernenbereich konnte nicht gespeichert werden.");
    }
  }

  async function assign(gate: AdminGate, barracksAreaId: string) {
    try {
      await fetchJson(`/api/admin/gates/${gate.id}`, { method: "PUT", body: JSON.stringify({ barracksAreaId }) });
      await load();
    } catch (caught) {
      setError((caught as ApiError).message || "Wache konnte nicht zugeordnet werden.");
    }
  }

  async function edit(area: Area) {
    const nextName = window.prompt("Name des Kasernenbereichs", area.name);
    if (nextName === null || !nextName.trim()) return;
    const nextDescription = window.prompt("Beschreibung", area.description || "");
    if (nextDescription === null) return;
    try {
      await fetchJson(`/api/admin/barracks-areas/${area.id}`, { method: "PATCH", body: JSON.stringify({ name: nextName, description: nextDescription }) });
      await load();
    } catch (caught) {
      setError((caught as ApiError).message || "Kasernenbereich konnte nicht geändert werden.");
    }
  }

  async function toggle(area: Area) {
    try {
      await fetchJson(`/api/admin/barracks-areas/${area.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !area.isActive }) });
      await load();
    } catch (caught) {
      setError((caught as ApiError).message || "Status konnte nicht geändert werden.");
    }
  }

  async function remove(area: Area) {
    if (!window.confirm(`Kasernenbereich „${area.name}“ wirklich löschen?`)) return;
    try {
      await fetchJson(`/api/admin/barracks-areas/${area.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError((caught as ApiError).message || "Kasernenbereich konnte nicht gelöscht werden.");
    }
  }

  return <AppLayout><main className="page-panel page-shell-wide">
    <section className="page-hero"><div className="page-hero-content"><h2>Kasernenbereiche</h2><p>Ein Kasernenbereich kann eine oder mehrere Wachen enthalten.</p></div></section>
    {error ? <Alert type="error">{error}</Alert> : null}
    <Card><div className="section-header"><h3>Bereich anlegen</h3></div><div className="form-grid two-columns">
      <FormField label="Name" required><input value={name} onChange={(event) => setName(event.target.value)} /></FormField>
      <FormField label="Beschreibung"><input value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
    </div><button type="button" disabled={!name.trim()} onClick={() => void create()}>Kasernenbereich anlegen</button></Card>
    <Card><div className="section-header"><h3>Wachen zuordnen</h3></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Wache</th><th>Standort</th><th>Kasernenbereich</th></tr></thead><tbody>{gates.map((gate) => <tr key={gate.id}><td>{gate.name}</td><td>{gate.location}</td><td><select value={gate.barracksAreaId || ""} onChange={(event) => void assign(gate, event.target.value)}><option value="">Nicht zugeordnet</option>{areas.filter((area) => area.isActive).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></td></tr>)}</tbody></table></div></Card>
    <div className="split-card-grid">{areas.map((area) => <Card key={area.id}><div className="section-header"><h3>{area.name}</h3><span>{area.isActive ? "Aktiv" : "Inaktiv"}</span></div><p>{area.description || "Keine Beschreibung"}</p><p>Wachen: {area.gates.map((gate) => gate.name).join(", ") || "Keine"}</p><div className="row-actions"><button type="button" className="secondary-button" onClick={() => void edit(area)}>Bearbeiten</button><button type="button" className="secondary-button" onClick={() => void toggle(area)}>{area.isActive ? "Deaktivieren" : "Aktivieren"}</button><button type="button" className="danger-button" disabled={area.gates.length > 0} onClick={() => void remove(area)}>Löschen</button></div></Card>)}</div>
  </main></AppLayout>;
}
