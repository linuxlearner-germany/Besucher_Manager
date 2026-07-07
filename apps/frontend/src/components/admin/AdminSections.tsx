import { type ChangeEvent, type Dispatch, type DragEvent, type FormEvent, type SetStateAction } from "react";
import { Alert, Card, DataTable, FormField } from "../ui";
import {
  type AdminAuditLog,
  type AdminErrorLog,
  type AdminFieldDefinition,
  type AdminGate,
  type AdminWorkflowSettings,
  type AdminUser,
  type AppPermission,
  type AppMenuKey,
  type EditableAdminUser,
  formatDateTime,
  formatAuditAction,
  formatFileSize,
  formatRoleLabel,
  formatUserAgent,
  getDefaultPermissionsForRole,
  getAllowedMenuAccessForRole,
  type SiteMapSummary,
  type UserPermissions
} from "../../app/core";

export type AdminSectionKey = "dashboard" | "wachen" | "benutzer" | "texte" | "karte" | "felder" | "audit" | "fehler" | "system";

function truncateLabel(value: string, maxLength = 36): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

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
      <article className="panel mini-card"><h3>Wachen</h3><p>{gates.filter((gate) => gate.isActive).length} aktive Wachen</p><button type="button" className="secondary-button" onClick={() => onOpenSection("wachen")}>Öffnen</button></article>
      <article className="panel mini-card"><h3>Benutzer</h3><p>{users.filter((entry) => entry.isActive).length} aktive Benutzer</p><button type="button" className="secondary-button" onClick={() => onOpenSection("benutzer")}>Öffnen</button></article>
      <article className="panel mini-card"><h3>Hinweistexte</h3><p>{texts.filter((text) => text.isActive).length} aktive Texte</p><button type="button" className="secondary-button" onClick={() => onOpenSection("texte")}>Öffnen</button></article>
      <article className="panel mini-card"><h3>Geländeplan</h3><p title={activeSiteMap?.name || "Kein aktiver Plan"}>{activeSiteMap ? truncateLabel(activeSiteMap.name) : "Kein aktiver Plan"}</p><button type="button" className="secondary-button" onClick={() => onOpenSection("karte")}>Öffnen</button></article>
      <article className="panel mini-card"><h3>Feldkonfiguration</h3><p>{fieldDefinitions.filter((field) => field.isActive).length} aktive Felder</p><button type="button" className="secondary-button" onClick={() => onOpenSection("felder")}>Öffnen</button></article>
      <article className="panel mini-card"><h3>Auditlog</h3><p>{logs.length} letzte Einträge</p><button type="button" className="secondary-button" onClick={() => onOpenSection("audit")}>Öffnen</button></article>
      <article className="panel mini-card"><h3>Fehlerlog</h3><p>{errorLogs.length} letzte Einträge</p><button type="button" className="secondary-button" onClick={() => onOpenSection("fehler")}>Öffnen</button></article>
      <article className="panel mini-card"><h3>Systemstatus</h3><p>{systemStatus ? `${systemStatus.activeVisits} aktiv, ${systemStatus.signaturesFollowUp} Nachreichungen` : "Lade..."}</p><button type="button" className="secondary-button" onClick={() => onOpenSection("system")}>Öffnen</button></article>
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
    <Card className="admin-section-stack">
      <div className="section-header">
        <div>
          <h3>Wachen</h3>
          <p className="section-copy">Neue Wachen kompakt anlegen und bestehende Standorte direkt pflegen.</p>
        </div>
      </div>
      <form className="admin-inline-form admin-gate-form" onSubmit={createGate}>
        <FormField label="Name">
          <input placeholder="z. B. Hauptwache" value={newGate.name} onChange={(event) => setNewGate((current) => ({ ...current, name: event.target.value }))} />
        </FormField>
        <FormField label="Standort">
          <input placeholder="z. B. Werk Nord" value={newGate.location} onChange={(event) => setNewGate((current) => ({ ...current, location: event.target.value }))} />
        </FormField>
        <FormField label="Beschreibung">
          <input placeholder="Kurze interne Einordnung" value={newGate.description} onChange={(event) => setNewGate((current) => ({ ...current, description: event.target.value }))} />
        </FormField>
        <div className="admin-form-actions admin-form-span-full">
          <button type="submit">Wache speichern</button>
        </div>
      </form>
      <div className="table-section admin-table-shell">
        <div className="table-section-header">
          <div>
            <h4>Bestehende Wachen</h4>
            <p className="section-copy">{gates.length} Einträge</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table admin-table-compact admin-gates-table">
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
                <td className="actions-cell">
                  <div className="action-row admin-action-row">
                    <button type="button" onClick={() => void saveGate(gate.id)}>Speichern</button>
                    <button className="danger-button" type="button" onClick={() => void toggleGateActive(gate.id, gate.isActive)}>{gate.isActive ? "Deaktivieren" : "Reaktivieren"}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

export function AdminUsersSection({
  newUser,
  setNewUser,
  menuOptions,
  permissionGroups,
  createUser,
  users,
  editableUsers,
  setEditableUsers,
  selectedUserId,
  setSelectedUserId,
  updateEditableUserRole,
  updateEditableUserGroups,
  formatGroupText,
  isPermissionEnabled,
  toggleNewUserMenuAccess,
  toggleNewUserPermission,
  toggleEditableUserMenuAccess,
  toggleEditableUserPermission,
  saveUser,
  toggleUserActive,
  deleteUser,
  currentUserId
}: {
  newUser: {
    username: string;
    displayName: string;
    email: string;
    password: string;
    role: AdminUser["role"];
    gateId: string;
    groupsText: string;
    menuAccess: AppMenuKey[];
    permissions: UserPermissions;
  };
  setNewUser: Dispatch<SetStateAction<{
    username: string;
    displayName: string;
    email: string;
    password: string;
    role: AdminUser["role"];
    gateId: string;
    groupsText: string;
    menuAccess: AppMenuKey[];
    permissions: UserPermissions;
  }>>;
  menuOptions: Array<{ key: AppMenuKey; label: string }>;
  permissionGroups: Array<{ title: string; items: Array<{ key: AppPermission; label: string }> }>;
  createUser: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  users: AdminUser[];
  editableUsers: Record<string, EditableAdminUser>;
  setEditableUsers: Dispatch<SetStateAction<Record<string, EditableAdminUser>>>;
  selectedUserId: string | null;
  setSelectedUserId: Dispatch<SetStateAction<string | null>>;
  updateEditableUserRole: (userId: string, role: AdminUser["role"]) => void;
  updateEditableUserGroups: (userId: string, value: string) => void;
  formatGroupText: (groups: string[] | undefined) => string;
  isPermissionEnabled: (permissions: UserPermissions, permission: AppPermission) => boolean;
  toggleNewUserMenuAccess: (menuKey: AppMenuKey, checked: boolean) => void;
  toggleNewUserPermission: (permission: AppPermission, checked: boolean) => void;
  toggleEditableUserMenuAccess: (userId: string, menuKey: AppMenuKey, checked: boolean) => void;
  toggleEditableUserPermission: (userId: string, permission: AppPermission, checked: boolean) => void;
  saveUser: (userId: string) => Promise<void>;
  toggleUserActive: (userId: string, active: boolean) => Promise<void>;
  deleteUser: (userEntry: AdminUser) => Promise<void>;
  currentUserId?: string;
}) {
  const selectedUser = selectedUserId ? editableUsers[selectedUserId] : null;

  function summarizeMenuAccess(menuAccess: AppMenuKey[]) {
    if (!menuAccess.length) {
      return "Keine";
    }
    return menuOptions
      .filter((option) => menuAccess.includes(option.key))
      .map((option) => option.label)
      .join(", ");
  }

  function summarizePermissions(user: EditableAdminUser) {
    const summary = permissionGroups.flatMap((group) =>
      group.items.filter((item) => isPermissionEnabled(user.permissions, item.key)).map((item) => item.label)
    );
    if (!summary.length) {
      return "Keine Zusatzrechte";
    }
    return summary.slice(0, 3).join(", ") + (summary.length > 3 ? ` +${summary.length - 3}` : "");
  }

  return (
    <Card className="admin-section-stack">
      <div className="section-header">
        <div>
          <h3>Benutzer</h3>
          <p className="section-copy">Neue Konten kompakt anlegen und bestehende Benutzer getrennt bearbeiten.</p>
        </div>
      </div>
      <div className="panel admin-user-card">
        <div className="table-section-header">
          <div>
            <h4>Neuer Benutzer</h4>
          </div>
        </div>
        <form className="admin-user-create-grid" onSubmit={createUser}>
          <FormField label="Benutzername">
            <input placeholder="Benutzername" value={newUser.username} onChange={(event) => setNewUser((current) => ({ ...current, username: event.target.value }))} />
          </FormField>
          <FormField label="Anzeigename">
            <input placeholder="Anzeigename" value={newUser.displayName} onChange={(event) => setNewUser((current) => ({ ...current, displayName: event.target.value }))} />
          </FormField>
          <FormField label={newUser.role === "guard" ? "E-Mail (optional)" : "E-Mail (optional)"}>
            <input type="text" inputMode="email" placeholder="name@firma.de" value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} />
          </FormField>
          <FormField label="Passwort">
            <input type="password" placeholder="Mindestens 8 Zeichen" value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} />
          </FormField>
          <FormField label="Rolle">
            <select
              value={newUser.role}
              onChange={(event) => {
                const role = event.target.value as AdminUser["role"];
                setNewUser((current) => ({
                  ...current,
                  role,
                  gateId: "",
                  menuAccess: getAllowedMenuAccessForRole(role),
                  permissions: role === "custom"
                    ? current.role === "custom" ? current.permissions : getDefaultPermissionsForRole("custom")
                    : getDefaultPermissionsForRole(role)
                }));
              }}
            >
              <option value="guard">Wache</option>
              <option value="admin">Admin</option>
              <option value="sibe">SiBe</option>
              <option value="kaskdt">Kasernenkommandant</option>
              <option value="custom">Benutzerdefiniert</option>
            </select>
          </FormField>
          <FormField label="Gruppen">
            <textarea rows={3} placeholder="z. B. Werkschutz, Schicht A" value={newUser.groupsText} onChange={(event) => setNewUser((current) => ({ ...current, groupsText: event.target.value }))} />
          </FormField>
          <div className="admin-user-access-shell">
            <div>
              <div className="admin-subsection-title">Menüzugriffe</div>
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
            </div>
            {newUser.role === "custom" ? (
              <div>
                <div className="admin-subsection-title">Berechtigungen</div>
                <div className="permission-group-grid">
                  {permissionGroups.map((group) => (
                    <div key={group.title} className="permission-group-card">
                      <strong>{group.title}</strong>
                      <div className="permission-check-list">
                        {group.items.map((item) => (
                          <label key={item.key} className="checkbox-row compact-checkbox">
                            <input
                              type="checkbox"
                              checked={isPermissionEnabled(newUser.permissions, item.key)}
                              onChange={(event) => toggleNewUserPermission(item.key, event.target.checked)}
                            />
                            {item.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="admin-form-actions admin-form-span-full">
            <button type="submit">Benutzer speichern</button>
          </div>
        </form>
      </div>
      <div className="table-section admin-table-shell">
        <div className="table-section-header">
          <div>
            <h4>Bestehende Benutzer</h4>
            <p className="section-copy">{users.length} Einträge</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table admin-table-compact admin-users-table">
          <thead><tr><th>Benutzername</th><th>Anzeigename</th><th>E-Mail</th><th>Rolle</th><th>Status</th><th>Menüzugriffe</th><th>Rechte</th><th>Aktion</th></tr></thead>
          <tbody>
            {users.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.username}</td>
                <td>{entry.displayName}</td>
                <td>{entry.email || "—"}</td>
                <td>{formatRoleLabel(entry.role)}</td>
                <td><span className={entry.isActive ? "badge status-active" : "badge status-cancelled"}>{entry.isActive ? "Aktiv" : "Inaktiv"}</span></td>
                <td className="truncate-cell" title={summarizeMenuAccess(entry.menuAccess)}>{summarizeMenuAccess(entry.menuAccess)}</td>
                <td className="truncate-cell" title={summarizePermissions(editableUsers[entry.id] || entry as EditableAdminUser)}>{summarizePermissions(editableUsers[entry.id] || entry as EditableAdminUser)}</td>
                <td className="actions-cell">
                  <div className="action-row admin-action-row compact-action-row">
                    <button type="button" className="secondary-button" onClick={() => setSelectedUserId(entry.id)}>Bearbeiten</button>
                    <button className="secondary-button" type="button" onClick={() => void toggleUserActive(entry.id, entry.isActive)}>{entry.isActive ? "Deaktivieren" : "Aktivieren"}</button>
                    <button className="danger-button" type="button" onClick={() => void deleteUser(entry)} disabled={currentUserId === entry.id}>Löschen</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>
      {selectedUser ? (
        <div className="panel admin-user-card">
          <div className="table-section-header">
            <div>
              <h4>Benutzer bearbeiten</h4>
              <p className="section-copy">{selectedUser.username}</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setSelectedUserId(null)}>Schließen</button>
          </div>
          <div className="admin-user-create-grid">
            <FormField label="Benutzername">
              <input value={selectedUser.username} onChange={(event) => setEditableUsers((current) => ({ ...current, [selectedUser.id]: { ...selectedUser, username: event.target.value } }))} />
            </FormField>
            <FormField label="Anzeigename">
              <input value={selectedUser.displayName} onChange={(event) => setEditableUsers((current) => ({ ...current, [selectedUser.id]: { ...selectedUser, displayName: event.target.value } }))} />
            </FormField>
            <FormField label="E-Mail (optional)">
              <input type="text" inputMode="email" value={selectedUser.email || ""} onChange={(event) => setEditableUsers((current) => ({ ...current, [selectedUser.id]: { ...selectedUser, email: event.target.value } }))} />
            </FormField>
            <FormField label="Neues Passwort">
              <input type="password" placeholder="Leer lassen für unverändert" value={selectedUser.password || ""} onChange={(event) => setEditableUsers((current) => ({ ...current, [selectedUser.id]: { ...selectedUser, password: event.target.value } }))} />
            </FormField>
            <FormField label="Rolle">
              <select value={selectedUser.role} onChange={(event) => updateEditableUserRole(selectedUser.id, event.target.value as AdminUser["role"])}>
                <option value="guard">Wache</option>
                <option value="admin">Admin</option>
                <option value="sibe">SiBe</option>
                <option value="kaskdt">Kasernenkommandant</option>
                <option value="custom">Benutzerdefiniert</option>
              </select>
            </FormField>
            <FormField label="Gruppen">
              <textarea rows={3} value={formatGroupText(selectedUser.groups)} onChange={(event) => updateEditableUserGroups(selectedUser.id, event.target.value)} />
            </FormField>
            <div className="admin-user-access-shell">
              <div>
                <div className="admin-subsection-title">Menüzugriffe</div>
                <div className="menu-access-grid">
                  {menuOptions.map((option) => {
                    const allowed = getAllowedMenuAccessForRole(selectedUser.role).includes(option.key);
                    return (
                      <label key={option.key} className={`checkbox-row compact-checkbox ${allowed ? "" : "muted-option"}`}>
                        <input
                          type="checkbox"
                          checked={selectedUser.menuAccess.includes(option.key)}
                          disabled={!allowed}
                          onChange={(event) => toggleEditableUserMenuAccess(selectedUser.id, option.key, event.target.checked)}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              {selectedUser.role === "custom" ? (
                <div>
                  <div className="admin-subsection-title">Berechtigungen</div>
                  <div className="permission-group-grid">
                    {permissionGroups.map((group) => (
                      <div key={group.title} className="permission-group-card">
                        <strong>{group.title}</strong>
                        <div className="permission-check-list">
                          {group.items.map((item) => (
                            <label key={item.key} className="checkbox-row compact-checkbox">
                              <input
                                type="checkbox"
                                checked={isPermissionEnabled(selectedUser.permissions, item.key)}
                                onChange={(event) => toggleEditableUserPermission(selectedUser.id, item.key, event.target.checked)}
                              />
                              {item.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="admin-form-actions admin-form-span-full">
              <label className="checkbox-row">
                <input type="checkbox" checked={selectedUser.isActive} onChange={(event) => setEditableUsers((current) => ({ ...current, [selectedUser.id]: { ...selectedUser, isActive: event.target.checked } }))} />
                Aktiv
              </label>
              <button type="button" onClick={() => void saveUser(selectedUser.id)}>Speichern</button>
            </div>
          </div>
        </div>
      ) : null}
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
      <h3>Geländeplan hochladen</h3>
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
            <img className="admin-site-map-preview" src={siteMapPreviewUrl} alt="Vorschau des neuen Geländeplans" />
          </div>
        ) : null}

        <div className="row-actions">
          <button type="submit" disabled={siteMapUploading || !siteMapFile}>
            {siteMapUploading ? "Upload läuft..." : "Geländeplan hochladen"}
          </button>
          <button className="secondary-button" type="button" onClick={resetSiteMapSelection}>
            Auswahl leeren
          </button>
        </div>
      </form>

      <div className="site-map-admin-grid">
        <div className="site-map-current">
          <h4>Aktiver Geländeplan</h4>
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
            <p className="section-copy">Aktuell ist kein aktiver Geländeplan gesetzt.</p>
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
  systemStatus,
  workflowSettings,
  setWorkflowSettings,
  workflowPassword,
  setWorkflowPassword,
  workflowTestRecipient,
  setWorkflowTestRecipient,
  saveWorkflowSettings,
  sendWorkflowTestMail
}: {
  systemStatus: {
    app: string;
    activeVisits: number;
    activeGates: number;
    openPreRegistrationsToday: number;
    signaturesPending: number;
    signaturesFollowUp: number;
    signaturesExceptions: number;
    approvalsPending?: number;
    retentionDays?: number | null;
    retentionEnabled?: boolean;
    dbHost?: string;
    dbName?: string;
  } | null;
  workflowSettings: AdminWorkflowSettings | null;
  setWorkflowSettings: Dispatch<SetStateAction<AdminWorkflowSettings | null>>;
  workflowPassword: string;
  setWorkflowPassword: Dispatch<SetStateAction<string>>;
  workflowTestRecipient: string;
  setWorkflowTestRecipient: Dispatch<SetStateAction<string>>;
  saveWorkflowSettings: () => Promise<void>;
  sendWorkflowTestMail: () => Promise<void>;
}) {
  return (
    <Card>
      <h3>Systemstatus</h3>
      <div className="card-grid stat-grid">
        <article className="panel mini-card"><h3>App</h3><p>{systemStatus?.app || "Lade..."}</p></article>
        <article className="panel mini-card"><h3>Aktive Wachen</h3><p>{systemStatus?.activeGates ?? "-"}</p></article>
        <article className="panel mini-card"><h3>Aktive Besucher</h3><p>{systemStatus?.activeVisits ?? "-"}</p></article>
        <article className="panel mini-card"><h3>Offene Voranmeldungen heute</h3><p>{systemStatus?.openPreRegistrationsToday ?? "-"}</p></article>
        <article className="panel mini-card"><h3>Freigaben offen</h3><p>{systemStatus?.approvalsPending ?? "-"}</p></article>
        <article className="panel mini-card"><h3>Unterschrift offen</h3><p>{systemStatus?.signaturesPending ?? "-"}</p></article>
        <article className="panel mini-card"><h3>Nachgereicht</h3><p>{systemStatus?.signaturesFollowUp ?? "-"}</p></article>
        <article className="panel mini-card"><h3>Ausnahmen</h3><p>{systemStatus?.signaturesExceptions ?? "-"}</p></article>
      </div>

      <div className="detail-grid">
        <div><dt>Datenbank</dt><dd>{systemStatus?.dbHost || "-"} / {systemStatus?.dbName || "-"}</dd></div>
        <div><dt>Aufbewahrung</dt><dd>{systemStatus?.retentionEnabled ? `${systemStatus?.retentionDays ?? "-"} Tage` : "deaktiviert"}</dd></div>
      </div>

      <div className="panel">
        <h3>SiBe-Freigabe und E-Mail-Relay</h3>
        <div className="form-grid two-columns">
          {workflowSettings?.emailRelay.source === "yml" ? (
            <div className="detail-span-2">
              <div className="feedback info">
                Das Mail-Relay wird aus einer YML-Datei geladen.
                {workflowSettings.emailRelay.configPath ? ` Pfad: ${workflowSettings.emailRelay.configPath}` : ""}
                {" "}Die SMTP-Felder sind hier nur lesbar, Tests bleiben moeglich.
              </div>
            </div>
          ) : null}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={workflowSettings?.approvalRequired ?? true}
              onChange={(event) => setWorkflowSettings((current) => current ? {
                ...current,
                approvalRequired: event.target.checked
              } : current)}
            />
            SiBe-Freigabe vor Check-in erzwingen
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={workflowSettings?.emailRelay.enabled ?? false}
              onChange={(event) => setWorkflowSettings((current) => current ? {
                ...current,
                emailRelay: {
                  ...current.emailRelay,
                  enabled: event.target.checked
                }
              } : current)}
            />
            E-Mail-Relay aktivieren
          </label>

          <FormField label="SMTP Host">
            <input
              disabled={workflowSettings?.emailRelay.isReadOnly ?? false}
              value={workflowSettings?.emailRelay.host ?? ""}
              onChange={(event) => setWorkflowSettings((current) => current ? {
                ...current,
                emailRelay: {
                  ...current.emailRelay,
                  host: event.target.value
                }
              } : current)}
            />
          </FormField>
          <FormField label="SMTP Port">
            <input
              type="number"
              disabled={workflowSettings?.emailRelay.isReadOnly ?? false}
              value={workflowSettings?.emailRelay.port ?? 587}
              onChange={(event) => setWorkflowSettings((current) => current ? {
                ...current,
                emailRelay: {
                  ...current.emailRelay,
                  port: Number(event.target.value) || 587
                }
              } : current)}
            />
          </FormField>
          <label className="checkbox-row">
            <input
              type="checkbox"
              disabled={workflowSettings?.emailRelay.isReadOnly ?? false}
              checked={workflowSettings?.emailRelay.secure ?? false}
              onChange={(event) => setWorkflowSettings((current) => current ? {
                ...current,
                emailRelay: {
                  ...current.emailRelay,
                  secure: event.target.checked
                }
              } : current)}
            />
            SMTPS / TLS direkt nutzen
          </label>
          <div />
          <FormField label="Benutzername">
            <input
              disabled={workflowSettings?.emailRelay.isReadOnly ?? false}
              value={workflowSettings?.emailRelay.username ?? ""}
              onChange={(event) => setWorkflowSettings((current) => current ? {
                ...current,
                emailRelay: {
                  ...current.emailRelay,
                  username: event.target.value
                }
              } : current)}
            />
          </FormField>
          <FormField label={workflowSettings?.emailRelay.hasPassword ? "Passwort (leer = beibehalten)" : "Passwort"}>
            <input
              type="password"
              disabled={workflowSettings?.emailRelay.isReadOnly ?? false}
              value={workflowPassword}
              onChange={(event) => setWorkflowPassword(event.target.value)}
            />
          </FormField>
          <FormField label="Absenderadresse">
            <input
              type="email"
              disabled={workflowSettings?.emailRelay.isReadOnly ?? false}
              value={workflowSettings?.emailRelay.fromAddress ?? ""}
              onChange={(event) => setWorkflowSettings((current) => current ? {
                ...current,
                emailRelay: {
                  ...current.emailRelay,
                  fromAddress: event.target.value
                }
              } : current)}
            />
          </FormField>
          <FormField label="SiBe-Empfaenger">
            <textarea
              rows={3}
              disabled={workflowSettings?.emailRelay.isReadOnly ?? false}
              value={(workflowSettings?.emailRelay.approvalRecipients ?? []).join(", ")}
              onChange={(event) => setWorkflowSettings((current) => current ? {
                ...current,
                emailRelay: {
                  ...current.emailRelay,
                  approvalRecipients: event.target.value
                    .split(/[,\n;]+/)
                    .map((entry) => entry.trim())
                    .filter(Boolean)
                }
              } : current)}
            />
          </FormField>
        </div>

        <div className="row-actions action-bar">
          <button type="button" onClick={() => void saveWorkflowSettings()}>Workflow speichern</button>
        </div>

        <div className="form-grid two-columns">
          <FormField label="Testadresse">
            <input
              type="email"
              value={workflowTestRecipient}
              onChange={(event) => setWorkflowTestRecipient(event.target.value)}
            />
          </FormField>
          <div className="row-actions action-bar">
            <button type="button" className="secondary-button" onClick={() => void sendWorkflowTestMail()}>
              Testmail senden
            </button>
          </div>
        </div>
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
    <Card className="admin-section-stack">
      <div className="section-header">
        <div>
          <h3>Auditlog</h3>
          <p className="section-copy">Aktionen, Benutzer und Zeiträume gezielt filtern.</p>
        </div>
      </div>
      <div className="filter-grid admin-filter-grid">
        <FormField label="Suche">
          <input placeholder="Benutzer, Aktion oder Objekt" value={auditFilters.search} onChange={(event) => setAuditFilters((current) => ({ ...current, search: event.target.value }))} />
        </FormField>
        <FormField label="Aktion">
          <input placeholder="z. B. VISIT_CHECKED_IN" value={auditFilters.action} onChange={(event) => setAuditFilters((current) => ({ ...current, action: event.target.value }))} />
        </FormField>
        <FormField label="Benutzer">
          <input placeholder="Benutzer" value={auditFilters.user} onChange={(event) => setAuditFilters((current) => ({ ...current, user: event.target.value }))} />
        </FormField>
        <FormField label="IP">
          <input placeholder="IP-Adresse" value={auditFilters.ip} onChange={(event) => setAuditFilters((current) => ({ ...current, ip: event.target.value }))} />
        </FormField>
        <FormField label="Von">
          <input type="datetime-local" value={auditFilters.from} onChange={(event) => setAuditFilters((current) => ({ ...current, from: event.target.value }))} />
        </FormField>
        <FormField label="Bis">
          <input type="datetime-local" value={auditFilters.to} onChange={(event) => setAuditFilters((current) => ({ ...current, to: event.target.value }))} />
        </FormField>
      </div>
      <div className="row-actions admin-filter-actions">
        <button type="button" onClick={() => void applyAuditFilters()}>Filter anwenden</button>
        <button type="button" className="secondary-button" onClick={() => void resetAuditFilters()}>Zurücksetzen</button>
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
              <td>{formatAuditAction(log.action)}</td>
              <td>{log.objectType}:{log.objectId}</td>
              <td>{log.ipAddress || "-"}</td>
              <td>{formatUserAgent(log.userAgent)}</td>
              <td><button type="button" className="secondary-button" onClick={() => setSelectedAuditLogId(log.id)}>Details</button></td>
            </tr>
          )) : (
            <tr>
              <td colSpan={7}>Keine Audit-Einträge für die aktuelle Auswahl gefunden.</td>
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
                {formatAuditAction(selectedAuditLog.action)} für {selectedAuditLog.objectType}:{selectedAuditLog.objectId}
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
    <Card className="admin-section-stack">
      <div className="section-header">
        <div>
          <h3>Fehlerlog</h3>
          <p className="section-copy">Fehler nach Code, Pfad und Zeitraum eingrenzen.</p>
        </div>
      </div>
      <div className="filter-grid admin-filter-grid">
        <FormField label="Suche">
          <input placeholder="Meldung, Benutzer oder Pfad" value={errorLogFilters.search} onChange={(event) => setErrorLogFilters((current) => ({ ...current, search: event.target.value }))} />
        </FormField>
        <FormField label="Fehlercode">
          <input placeholder="Fehlercode" value={errorLogFilters.errorCode} onChange={(event) => setErrorLogFilters((current) => ({ ...current, errorCode: event.target.value }))} />
        </FormField>
        <FormField label="Pfad">
          <input placeholder="/api/..." value={errorLogFilters.path} onChange={(event) => setErrorLogFilters((current) => ({ ...current, path: event.target.value }))} />
        </FormField>
        <FormField label="Von">
          <input type="datetime-local" value={errorLogFilters.from} onChange={(event) => setErrorLogFilters((current) => ({ ...current, from: event.target.value }))} />
        </FormField>
        <FormField label="Bis">
          <input type="datetime-local" value={errorLogFilters.to} onChange={(event) => setErrorLogFilters((current) => ({ ...current, to: event.target.value }))} />
        </FormField>
      </div>
      <div className="row-actions admin-filter-actions">
        <button type="button" onClick={() => void applyErrorLogFilters()}>Filter anwenden</button>
        <button type="button" className="secondary-button" onClick={() => void resetErrorLogFilters()}>Zurücksetzen</button>
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
                <button type="button" className="secondary-button" onClick={() => setSelectedErrorLogId(entry.id)}>Details</button>
              </td>
            </tr>
          )) : (
            <tr>
              <td colSpan={6}>Keine Fehler für die aktuelle Auswahl gefunden.</td>
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
