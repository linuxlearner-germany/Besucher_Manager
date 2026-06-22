import { useCallback, useEffect, useState } from "react";
import { Alert, DataTable } from "../components/ui";
import { AppLayout, type ApiError, fetchJson, formatDateTime, type SibeUserRow } from "../app/core";

export function SibeUsersPage() {
  const [users, setUsers] = useState<SibeUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [active, setActive] = useState("all");
  const [lastLoginFrom, setLastLoginFrom] = useState("");
  const [lastLoginTo, setLastLoginTo] = useState("");
  const [gate, setGate] = useState("");

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (search) params.set("username", search);
      if (role !== "all") params.set("role", role);
      if (active !== "all") params.set("active", active);
      if (gate) params.set("gate", gate);
      if (lastLoginFrom) params.set("lastLoginFrom", lastLoginFrom);
      if (lastLoginTo) params.set("lastLoginTo", lastLoginTo);
      const payload = await fetchJson<{ users: SibeUserRow[] }>(`/api/sibe/users?${params.toString()}`, { method: "GET", headers: {} });
      setUsers(payload.users);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Benutzer konnten nicht geladen werden.");
    }
  }, [active, gate, lastLoginFrom, lastLoginTo, role, search]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
        <div className="section-header">
          <div>
            <h2>SiBe Benutzer</h2>
            <p className="section-copy">Anwendungskonten lesen, filtern und Rollen zuordnen nachvollziehen.</p>
          </div>
        </div>

        <div className="toolbar filter-bar">
          <input placeholder="Benutzername suchen" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="all">Alle Rollen</option>
            <option value="admin">admin</option>
            <option value="guard">guard</option>
            <option value="sibe">sibe</option>
            <option value="kaskdt">kaskdt</option>
          </select>
          <select value={active} onChange={(event) => setActive(event.target.value)}>
            <option value="all">Alle Stati</option>
            <option value="true">Aktiv</option>
            <option value="false">Inaktiv</option>
          </select>
          <input placeholder="Wache" value={gate} onChange={(event) => setGate(event.target.value)} />
          <input type="date" value={lastLoginFrom} onChange={(event) => setLastLoginFrom(event.target.value)} />
          <input type="date" value={lastLoginTo} onChange={(event) => setLastLoginTo(event.target.value)} />
        </div>

        {error ? <Alert type="error">{error}</Alert> : null}

        <DataTable>
          <thead>
            <tr>
              <th>Benutzername</th>
              <th>Rolle</th>
              <th>Wache</th>
              <th>Status</th>
              <th>Erstellt am</th>
              <th>Letzter Login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.username}</td>
                <td>{entry.role}</td>
                <td>{entry.gateName || "-"}</td>
                <td>{entry.isActive ? "Aktiv" : "Inaktiv"}</td>
                <td>{formatDateTime(entry.createdAt)}</td>
                <td>{formatDateTime(entry.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </main>
    </AppLayout>
  );
}
