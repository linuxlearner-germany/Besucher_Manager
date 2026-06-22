import { type ChangeEvent, type Dispatch, type DragEvent, type FormEvent, type SetStateAction } from "react";
import { Alert, Card, DataTable, FormField } from "../ui";
import {
  type AdminAuditLog,
  type AdminErrorLog,
  type AdminFieldDefinition,
  type AdminGate,
  type AdminUser,
  type AppMenuKey,
  type EditableAdminUser,
  formatDateTime,
  formatFileSize,
  formatUserAgent,
  getAllowedMenuAccessForRole,
  type SiteMapSummary
} from "../../app/core";

export type AdminSectionKey = "dashboard" | "wachen" | "benutzer" | "texte" | "karte" | "felder" | "audit" | "fehler" | "system";

export function AdminDashboardSection({
  gates,
  users,
  texts,
  activeSiteMap,
  fieldDefinitions,
  logs,
  errorLogs,
  systemStatus,
  onOpenSection
}: {
  gates: AdminGate[];
  users: AdminUser[];
  texts: Array<{ isActive: boolean }>;
  activeSiteMap: SiteMapSummary;
  fieldDefinitions: AdminFieldDefinition[];
  logs: AdminAuditLog[];
  errorLogs: AdminErrorLog[];
  systemStatus: { activeVisits: number; signaturesFollowUp: number } | null;
  onOpenSection: (section: AdminSectionKey) => void;
}) {
  return (
    <div className="card-grid stat-grid admin-dashboard-grid">
      <article className="panel mini-card"><h3>Wachen</h3><p>{gates.filter((gate) => gate.isActive).length} aktive Wachen</p><button type="button" className="secondary-button" onClick={() => onOpenSection("wachen")}>Oeffnen</button></article>
      <article className="panel mini-card"><h3>Benutzer</h3><p>{users.filter((entry) => entry.isActive).length} aktive Benutzer</p><button type="button" className="secondary-button" onClick={() => onOpenSection("benutzer")}>Oeffnen</button></article>
      <article className="panel mini-card"><h3>Hinweistexte</h3><p>{texts.filter((text) => text.isActive).length} aktive Texte</p><button type="button" className="secondary-button" onClick={() => onOpenSection("texte")}>Oeffnen</button></article>
      <article className="panel mini-card"><h3>Gelaendeplan</h3><p>{activeSiteMap ? activeSiteMap.name : "Kein aktiver Plan"}</p><button type="button" className="secondary-button" onClick={() => onOpenSection("karte")}>Oeffnen</button></article>
      <article className="panel mini-card"><h3>Feldkonfiguration</h3><p>{fieldDefinitions.filter((field) => field.isActive).length} aktive Felder</p><button type="button" className="secondary-button" onClick={() => onOpenSection("felder")}>Oeffnen</button></article>
      <article className="panel mini-card"><h3>Auditlog</h3><p>{logs.length} letzte Eintraege</p><button type="button" className="secondary-button" onClick={() => onOpenSection("audit")}>Oeffnen</button></article>
      <article className="panel mini-card"><h3>Fehlerlog</h3><p>{errorLogs.length} letzte Eintraege</p><button type="button" className="secondary-button" onClick={() => onOpenSection("fehler")}>Oeffnen</button></article>
      <article className="panel mini-card"><h3>Systemstatus</h3><p>{systemStatus ? `${systemStatus.activeVisits} aktiv, ${systemStatus.signaturesFollowUp} Nachreichungen` : "Lade..."}</p><button type="button" className="secondary-button" onClick={() => onOpenSection("system")}>Oeffnen</button></article>
    </div>
  );
}

export function AdminGatesSection({
  newGate,
  setNewGate,
  createGate,
  gates,
  editableGates,
  setEditableGates,
  saveGate,
  toggleGateActive
}: {
  newGate: { name: string; description: string; location: string };
  setNewGate: Dispatch<SetStateAction<{ name: string; description: string; location: string }>>;
  createGate: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  gates: AdminGate[];
  editableGates: Record<string, AdminGate>;
  setEditableGates: Dispatch<SetStateAction<Record<string, AdminGate>>>;
  saveGate: (gateId: string) => Promise<void>;
  toggleGateActive: (gateId: string, active: boolean) => Promise<void>;
}) {
  return (
    <Card>
      <h3>Wachen</h3>
      <form className="form-grid two-columns" onSubmit={createGate}>
        <input placeholder="Name" value={newGate.name} onChange={(event) => setNewGate((current) => ({ ...current, name: event.target.value }))} />
        <input placeholder="Standort" value={newGate.location} onChange={(event) => setNewGate((current) => ({ ...current, location: event.target.value }))} />
        <input placeholder="Beschreibung" value={newGate.description} onChange={(event) => setNewGate((current) => ({ ...current, description: event.target.value }))} />
        <button type="submit">Wache speichern</button>
      </form>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Standort</th><th>Status</th><th>Aktion</th></tr></thead>
          <tbody>
            {gates.map((gate) => (
              <tr key={gate.id}>
                <td>
                  <input value={editableGates[gate.id]?.name || ""} onChange={(event) => setEditableGates((current) => ({ ...current, [gate.id]: { ...(current[gate.id] || gate), name: event.target.value } }))} />
                </td>
                <td>
                  <input value={editableGates[gate.id]?.location || ""} onChange={(event) => setEditableGates((current) => ({ ...current, [gate.id]: { ...(current[gate.id] || gate), location: event.target.value } }))} />
                </td>
                <td>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={editableGates[gate.id]?.isActive ?? gate.isActive} onChange={(event) => setEditableGates((current) => ({ ...current, [gate.id]: { ...(current[gate.id] || gate), isActive: event.target.checked } }))} />
                    Aktiv
                  </label>
                </td>
                <td>
                  <div className="row-actions">
                    <button type="button" onClick={() => void saveGate(gate.id)}>Speichern</button>
                    <button className="danger-button" type="button" onClick={() => void toggleGateActive(gate.id, gate.isActive)}>{gate.isActive ? "Deaktivieren" : "Reaktivieren"}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AdminUsersSection({
  newUser,
  setNewUser,
  menuOptions,
  createUser,
  users,
  editableUsers,
  setEditableUsers,
  updateEditableUserRole,
  updateEditableUserGroups,
  formatGroupText,
  toggleNewUserMenuAccess,
  toggleEditableUserMenuAccess,
  saveUser,
  toggleUserActive,
  deleteUser,
  currentUserId
}: {
  newUser: {
    username: string;
    displayName: string;
    password: string;
    role: AdminUser["role"];
    gateId: string;
    groupsText: string;
    menuAccess: AppMenuKey[];
  };
  setNewUser: Dispatch<SetStateAction<{
    username: string;
    displayName: string;
    password: string;
    role: AdminUser["role"];
    gateId: string;
    groupsText: string;
    menuAccess: AppMenuKey[];
  }>>;
  menuOptions: Array<{ key: AppMenuKey; label: string }>;
  createUser: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  users: AdminUser[];
  editableUsers: Record<string, EditableAdminUser>;
  setEditableUsers: Dispatch<SetStateAction<Record<string, EditableAdminUser>>>;
  updateEditableUserRole: (userId: string, role: AdminUser["role"]) => void;
  updateEditableUserGroups: (userId: string, value: string) => void;
  formatGroupText: (groups: string[] | undefined) => string;
  toggleNewUserMenuAccess: (menuKey: AppMenuKey, checked: boolean) => void;
  toggleEditableUserMenuAccess: (userId: string, menuKey: AppMenuKey, checked: boolean) => void;
  saveUser: (userId: string) => Promise<void>;
  toggleUserActive: (userId: string, active: boolean) => Promise<void>;
  deleteUser: (userEntry: AdminUser) => Promise<void>;
  currentUserId?: string;
}) {
  return (
    <Card>
      <h3>Benutzer</h3>
      <form className="form-grid two-columns" onSubmit={createUser}>
        <input placeholder="Benutzername" value={newUser.username} onChange={(event) => setNewUser((current) => ({ ...current, username: event.target.value }))} />
        <input placeholder="Anzeigename" value={newUser.displayName} onChange={(event) => setNewUser((current) => ({ ...current, displayName: event.target.value }))} />
        <input type="password" placeholder="Passwort (min. 8)" value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} />
        <select value={newUser.role} onChange={(event) => {
          const role = event.target.value as AdminUser["role"];
          setNewUser((current) => ({ ...current, role, gateId: "", menuAccess: getAllowedMenuAccessForRole(role) }));
        }}>
          <option value="guard">guard</option>
          <option value="admin">admin</option>
          <option value="sibe">sibe</option>
          <option value="kaskdt">kaskdt</option>
        </select>
        <textarea
          placeholder="Gruppen, z. B. Werkschutz, Schicht A"
          value={newUser.groupsText}
          onChange={(event) => setNewUser((current) => ({ ...current, groupsText: event.target.value }))}
        />
        <div className="menu-access-grid">
          {menuOptions.map((option) => {
            const allowed = getAllowedMenuAccessForRole(newUser.role).includes(option.key);
            return (
              <label key={option.key} className={`checkbox-row compact-checkbox ${allowed ? "" : "muted-option"}`}>
                <input
                  type="checkbox"
                  checked={newUser.menuAccess.includes(option.key)}
                  disabled={!allowed}
                  onChange={(event) => toggleNewUserMenuAccess(option.key, event.target.checked)}
                />
                {option.label}
              </label>
            );
          })}
        </div>
        <button type="submit">Benutzer speichern</button>
      </form>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Username</th><th>Anzeigename</th><th>Rolle</th><th>Gruppen</th><th>Menü</th><th>Passwort</th><th>Status</th><th>Aktion</th></tr></thead>
          <tbody>
            {users.map((entry) => (
              <tr key={entry.id}>
                <td><input value={editableUsers[entry.id]?.username || ""} onChange={(event) => setEditableUsers((current) => ({ ...current, [entry.id]: { ...(current[entry.id] || entry), username: event.target.value } }))} /></td>
                <td><input value={editableUsers[entry.id]?.displayName || ""} onChange={(event) => setEditableUsers((current) => ({ ...current, [entry.id]: { ...(current[entry.id] || entry), displayName: event.target.value } }))} /></td>
                <td>
                  <select value={editableUsers[entry.id]?.role || entry.role} onChange={(event) => updateEditableUserRole(entry.id, event.target.value as AdminUser["role"])}>
                    <option value="guard">guard</option>
                    <option value="admin">admin</option>
                    <option value="sibe">sibe</option>
                    <option value="kaskdt">kaskdt</option>
                  </select>
                </td>
                <td>
                  <textarea
                    rows={2}
                    value={formatGroupText(editableUsers[entry.id]?.groups)}
                    onChange={(event) => updateEditableUserGroups(entry.id, event.target.value)}
                  />
                </td>
                <td>
                  <div className="menu-access-grid menu-access-grid-compact">
                    {menuOptions.map((option) => {
                      const currentEntry = editableUsers[entry.id] || entry;
                      const allowed = getAllowedMenuAccessForRole(currentEntry.role).includes(option.key);
                      return (
                        <label key={option.key} className={`checkbox-row compact-checkbox ${allowed ? "" : "muted-option"}`}>
                          <input
                            type="checkbox"
                            checked={currentEntry.menuAccess.includes(option.key)}
                            disabled={!allowed}
                            onChange={(event) => toggleEditableUserMenuAccess(entry.id, option.key, event.target.checked)}
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                </td>
                <td>
                  <input
                    type="password"
                    placeholder="Neues Passwort"
                    value={editableUsers[entry.id]?.password || ""}
                    onChange={(event) => setEditableUsers((current) => ({ ...current, [entry.id]: { ...(current[entry.id] || entry), password: event.target.value } }))}
                  />
                </td>
                <td>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={editableUsers[entry.id]?.isActive ?? entry.isActive} onChange={(event) => setEditableUsers((current) => ({ ...current, [entry.id]: { ...(current[entry.id] || entry), isActive: event.target.checked } }))} />
                    Aktiv
                  </label>
                </td>
                <td>
                  <div className="row-actions">
                    <button type="button" onClick={() => void saveUser(entry.id)}>Speichern</button>
                    <button className="danger-button" type="button" onClick={() => void toggleUserActive(entry.id, entry.isActive)}>{entry.isActive ? "Deaktivieren" : "Reaktivieren"}</button>
                    <button className="danger-button" type="button" onClick={() => void deleteUser(entry)} disabled={currentUserId === entry.id}>Loeschen</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function AdminSiteMapSection({
  uploadSiteMap,
  siteMapName,
  setSiteMapName,
  dragActive,
  setDragActive,
  handleSiteMapDrop,
  handleSiteMapFileInput,
  siteMapFile,
  siteMapFieldError,
  siteMapPreviewUrl,
  siteMapUploading,
  resetSiteMapSelection,
  activeSiteMap,
  siteMaps,
  activateSiteMap
}: {
  uploadSiteMap: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  siteMapName: string;
  setSiteMapName: Dispatch<SetStateAction<string>>;
  dragActive: boolean;
  setDragActive: Dispatch<SetStateAction<boolean>>;
  handleSiteMapDrop: (event: DragEvent<HTMLLabelElement>) => void;
  handleSiteMapFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  siteMapFile: File | null;
  siteMapFieldError: string | null;
  siteMapPreviewUrl: string | null;
  siteMapUploading: boolean;
  resetSiteMapSelection: () => void;
  activeSiteMap: SiteMapSummary;
  siteMaps: NonNullable<SiteMapSummary>[];
  activateSiteMap: (siteMapId: string) => Promise<void>;
}) {
  return (
    <Card>
      <h3>Gelaendeplan hochladen</h3>
      <form className="site-map-upload-stack" onSubmit={uploadSiteMap}>
        <FormField label="Bezeichnung">
          <input
            placeholder="z. B. Werkplan Nord"
            value={siteMapName}
            onChange={(event) => setSiteMapName(event.target.value)}
          />
        </FormField>

        <label
          className={`dropzone ${dragActive ? "dropzone-active" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={handleSiteMapDrop}
        >
          <input
            className="visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleSiteMapFileInput}
          />
          <div className="dropzone-copy">
            <strong>Datei ablegen oder anklicken</strong>
            <span>PNG, JPG oder WEBP bis 10 MB</span>
          </div>
          {siteMapFile ? (
            <div className="dropzone-selected">
              <span>{siteMapFile.name}</span>
              <span>{formatFileSize(siteMapFile.size)}</span>
            </div>
          ) : null}
        </label>

        {siteMapFieldError ? <Alert type="error">{siteMapFieldError}</Alert> : null}

        {siteMapPreviewUrl ? (
          <div className="site-map-preview-card">
            <p className="section-copy">Vorschau vor dem Upload</p>
            <img className="admin-site-map-preview" src={siteMapPreviewUrl} alt="Vorschau des neuen Gelaendeplans" />
          </div>
        ) : null}

        <div className="row-actions">
          <button type="submit" disabled={siteMapUploading || !siteMapFile}>
            {siteMapUploading ? "Upload laeuft..." : "Gelaendeplan hochladen"}
          </button>
          <button className="secondary-button" type="button" onClick={resetSiteMapSelection}>
            Auswahl leeren
          </button>
        </div>
      </form>

      <div className="site-map-admin-grid">
        <div className="site-map-current">
          <h4>Aktiver Gelaendeplan</h4>
          {activeSiteMap ? (
            <>
              <img className="admin-site-map-preview" src={activeSiteMap.filePath} alt={activeSiteMap.name} />
              <div className="meta-list">
                <span><strong>Name:</strong> {activeSiteMap.name}</span>
                <span><strong>Datei:</strong> {activeSiteMap.originalFileName || activeSiteMap.storedFileName || "-"}</span>
                <span><strong>Typ:</strong> {activeSiteMap.mimeType || "-"}</span>
                <span><strong>Groesse:</strong> {formatFileSize(activeSiteMap.fileSizeBytes)}</span>
                <span><strong>Hochgeladen:</strong> {formatDateTime(activeSiteMap.createdAt)}</span>
              </div>
            </>
          ) : (
            <p className="section-copy">Aktuell ist kein aktiver Gelaendeplan gesetzt.</p>
          )}
        </div>

        <div className="site-map-history">
          <h4>Bisherige Gelaendeplaene</h4>
          <DataTable>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Datei</th>
                <th>Typ</th>
                <th>Groesse</th>
                <th>Upload</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {siteMaps.length ? siteMaps.map((map) => (
                <tr key={map.id}>
                  <td>{map.name}</td>
                  <td><span className={map.isActive ? "badge status-active" : "badge status-cancelled"}>{map.isActive ? "Aktiv" : "Inaktiv"}</span></td>
                  <td>{map.originalFileName || map.storedFileName || "-"}</td>
                  <td>{map.mimeType || "-"}</td>
                  <td>{formatFileSize(map.fileSizeBytes)}</td>
                  <td>{formatDateTime(map.createdAt)}</td>
                  <td>
                    {map.isActive ? (
                      <span className="section-copy">Aktiv</span>
                    ) : (
                      <button type="button" className="secondary-button" onClick={() => void activateSiteMap(map.id)}>
                        Als aktiv setzen
                      </button>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7}>Noch keine Gelaendeplaene vorhanden.</td>
                </tr>
              )}
            </tbody>
          </DataTable>
        </div>
      </div>
    </Card>
  );
}

export function AdminSystemSection({
  systemStatus
}: {
  systemStatus: {
    app: string;
    activeVisits: number;
    activeGates: number;
    openPreRegistrationsToday: number;
    signaturesPending: number;
    signaturesFollowUp: number;
    signaturesExceptions: number;
  } | null;
}) {
  return (
    <Card>
      <h3>Systemstatus</h3>
      <div className="card-grid stat-grid">
        <article className="panel mini-card"><h3>App</h3><p>{systemStatus?.app || "Lade..."}</p></article>
        <article className="panel mini-card"><h3>Aktive Wachen</h3><p>{systemStatus?.activeGates ?? "-"}</p></article>
        <article className="panel mini-card"><h3>Aktive Besucher</h3><p>{systemStatus?.activeVisits ?? "-"}</p></article>
        <article className="panel mini-card"><h3>Offene Voranmeldungen heute</h3><p>{systemStatus?.openPreRegistrationsToday ?? "-"}</p></article>
        <article className="panel mini-card"><h3>Unterschrift offen</h3><p>{systemStatus?.signaturesPending ?? "-"}</p></article>
        <article className="panel mini-card"><h3>Nachgereicht</h3><p>{systemStatus?.signaturesFollowUp ?? "-"}</p></article>
        <article className="panel mini-card"><h3>Ausnahmen</h3><p>{systemStatus?.signaturesExceptions ?? "-"}</p></article>
      </div>
    </Card>
  );
}

export function AdminAuditSection({
  auditFilters,
  setAuditFilters,
  applyAuditFilters,
  resetAuditFilters,
  logs,
  selectedAuditLog,
  setSelectedAuditLogId
}: {
  auditFilters: { search: string; action: string; user: string; ip: string; from: string; to: string };
  setAuditFilters: Dispatch<SetStateAction<{ search: string; action: string; user: string; ip: string; from: string; to: string }>>;
  applyAuditFilters: () => Promise<void>;
  resetAuditFilters: () => Promise<void>;
  logs: AdminAuditLog[];
  selectedAuditLog: AdminAuditLog | null;
  setSelectedAuditLogId: Dispatch<SetStateAction<string | null>>;
}) {
  return (
    <Card>
      <h3>Auditlog</h3>
      <div className="toolbar audit-toolbar">
        <input placeholder="Suche nach Benutzer, Aktion oder Objekt" value={auditFilters.search} onChange={(event) => setAuditFilters((current) => ({ ...current, search: event.target.value }))} />
        <input placeholder="Aktion" value={auditFilters.action} onChange={(event) => setAuditFilters((current) => ({ ...current, action: event.target.value }))} />
        <input placeholder="Benutzer" value={auditFilters.user} onChange={(event) => setAuditFilters((current) => ({ ...current, user: event.target.value }))} />
        <input placeholder="IP" value={auditFilters.ip} onChange={(event) => setAuditFilters((current) => ({ ...current, ip: event.target.value }))} />
        <input type="datetime-local" value={auditFilters.from} onChange={(event) => setAuditFilters((current) => ({ ...current, from: event.target.value }))} />
        <input type="datetime-local" value={auditFilters.to} onChange={(event) => setAuditFilters((current) => ({ ...current, to: event.target.value }))} />
        <button type="button" onClick={() => void applyAuditFilters()}>Filter anwenden</button>
        <button type="button" className="secondary-button" onClick={() => void resetAuditFilters()}>Zuruecksetzen</button>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>Zeit</th>
            <th>Benutzer</th>
            <th>Aktion</th>
            <th>Objekt</th>
            <th>IP</th>
            <th>User-Agent</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.length ? logs.map((log) => (
            <tr key={log.id}>
              <td>{formatDateTime(log.timestamp)}</td>
              <td>{log.user}</td>
              <td>{log.action}</td>
              <td>{log.objectType}:{log.objectId}</td>
              <td>{log.ipAddress || "-"}</td>
              <td>{formatUserAgent(log.userAgent)}</td>
              <td>
                <button type="button" className="secondary-button" onClick={() => setSelectedAuditLogId(log.id)}>
                  Anzeigen
                </button>
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan={7}>Keine Audit-Eintraege fuer die aktuelle Auswahl gefunden.</td>
            </tr>
          )}
        </tbody>
      </DataTable>

      {selectedAuditLog ? (
        <div className="audit-detail-panel">
          <div className="section-header">
            <div>
              <h3>Audit-Details</h3>
              <p className="section-copy">
                {selectedAuditLog.action} fuer {selectedAuditLog.objectType}:{selectedAuditLog.objectId}
              </p>
            </div>
          </div>
          <dl className="detail-grid">
            <div><dt>Zeit</dt><dd>{formatDateTime(selectedAuditLog.timestamp)}</dd></div>
            <div><dt>Benutzer</dt><dd>{selectedAuditLog.user}</dd></div>
            <div><dt>IP</dt><dd>{selectedAuditLog.ipAddress || "-"}</dd></div>
            <div><dt>User-Agent</dt><dd>{selectedAuditLog.userAgent || "-"}</dd></div>
          </dl>
          <FormField label="metadata_json">
            <textarea readOnly rows={10} value={selectedAuditLog.metadataJson || "{}"} />
          </FormField>
        </div>
      ) : null}
    </Card>
  );
}

export function AdminErrorLogSection({
  errorLogFilters,
  setErrorLogFilters,
  applyErrorLogFilters,
  resetErrorLogFilters,
  errorLogs,
  selectedErrorLog,
  setSelectedErrorLogId
}: {
  errorLogFilters: { search: string; errorCode: string; path: string; from: string; to: string };
  setErrorLogFilters: Dispatch<SetStateAction<{ search: string; errorCode: string; path: string; from: string; to: string }>>;
  applyErrorLogFilters: () => Promise<void>;
  resetErrorLogFilters: () => Promise<void>;
  errorLogs: AdminErrorLog[];
  selectedErrorLog: AdminErrorLog | null;
  setSelectedErrorLogId: Dispatch<SetStateAction<string | null>>;
}) {
  return (
    <Card>
      <h3>Fehlerlog</h3>
      <div className="toolbar audit-toolbar">
        <input placeholder="Suche nach Meldung, Benutzer oder Pfad" value={errorLogFilters.search} onChange={(event) => setErrorLogFilters((current) => ({ ...current, search: event.target.value }))} />
        <input placeholder="Fehlercode" value={errorLogFilters.errorCode} onChange={(event) => setErrorLogFilters((current) => ({ ...current, errorCode: event.target.value }))} />
        <input placeholder="Pfad" value={errorLogFilters.path} onChange={(event) => setErrorLogFilters((current) => ({ ...current, path: event.target.value }))} />
        <input type="datetime-local" value={errorLogFilters.from} onChange={(event) => setErrorLogFilters((current) => ({ ...current, from: event.target.value }))} />
        <input type="datetime-local" value={errorLogFilters.to} onChange={(event) => setErrorLogFilters((current) => ({ ...current, to: event.target.value }))} />
        <button type="button" onClick={() => void applyErrorLogFilters()}>Filter anwenden</button>
        <button type="button" className="secondary-button" onClick={() => void resetErrorLogFilters()}>Zuruecksetzen</button>
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>Zeit</th>
            <th>Code</th>
            <th>Meldung</th>
            <th>Pfad</th>
            <th>Benutzer</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {errorLogs.length ? errorLogs.map((entry) => (
            <tr key={entry.id}>
              <td>{formatDateTime(entry.timestamp)}</td>
              <td>{entry.errorCode}</td>
              <td>{entry.message}</td>
              <td>{entry.requestMethod || "-"} {entry.requestPath || "-"}</td>
              <td>{entry.userName || "-"}</td>
              <td>
                <button type="button" className="secondary-button" onClick={() => setSelectedErrorLogId(entry.id)}>
                  Anzeigen
                </button>
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan={6}>Keine Fehler fuer die aktuelle Auswahl gefunden.</td>
            </tr>
          )}
        </tbody>
      </DataTable>

      {selectedErrorLog ? (
        <div className="audit-detail-panel">
          <div className="section-header">
            <div>
              <h3>Fehlerdetails</h3>
              <p className="section-copy">{selectedErrorLog.errorCode} am {formatDateTime(selectedErrorLog.timestamp)}</p>
            </div>
          </div>
          <dl className="detail-grid">
            <div><dt>Benutzer</dt><dd>{selectedErrorLog.userName || "-"}</dd></div>
            <div><dt>IP</dt><dd>{selectedErrorLog.ipAddress || "-"}</dd></div>
            <div><dt>Pfad</dt><dd>{selectedErrorLog.requestPath || "-"}</dd></div>
            <div><dt>Methode</dt><dd>{selectedErrorLog.requestMethod || "-"}</dd></div>
            <div className="detail-span-2"><dt>User-Agent</dt><dd>{selectedErrorLog.userAgent || "-"}</dd></div>
            <div className="detail-span-2"><dt>Meldung</dt><dd>{selectedErrorLog.message}</dd></div>
          </dl>
          <FormField label="stack_trace">
            <textarea readOnly rows={12} value={selectedErrorLog.stackTrace || "-"} />
          </FormField>
          <FormField label="metadata_json">
            <textarea readOnly rows={8} value={selectedErrorLog.metadataJson || "{}"} />
          </FormField>
        </div>
      ) : null}
    </Card>
  );
}
