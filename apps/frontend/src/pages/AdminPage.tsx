import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent
} from "react";
import {
  AdminAuditSection,
  AdminDashboardSection,
  AdminErrorLogSection,
  AdminGatesSection,
  type AdminSectionKey,
  AdminSiteMapSection,
  AdminSystemSection,
  AdminUsersSection
} from "../components/admin/AdminSections";
import { Alert, Card, FormField } from "../components/ui";
import { BadgeTextManager } from "../components/BadgeTextManager";
import {
  type AppMenuKey,
  AppLayout,
  type AdminAuditLog,
  type AdminBadgeText,
  type AdminErrorLog,
  type AdminFieldDefinition,
  type AdminGate,
  type AdminUser,
  type ApiError,
  type EditableAdminUser,
  extractFieldErrors,
  fetchJson,
  getAllowedMenuAccessForRole,
  type FieldConfigExportPayload,
  type NewFieldDefinitionForm,
  type SiteMapSummary,
  useAuth
} from "../app/core";

export function AdminPage() {
  const { user: currentUser } = useAuth();
  const menuOptions: Array<{ key: AppMenuKey; label: string }> = [
    { key: "wache", label: "Wache" },
    { key: "import", label: "Import" },
    { key: "admin", label: "Admin" },
    { key: "sibe", label: "SiBe" },
    { key: "kaskdt", label: "KasKdt" },
    { key: "texte", label: "Texte" }
  ];
  const [activeSection, setActiveSection] = useState<AdminSectionKey>("dashboard");
  const [stats, setStats] = useState<{ users: number; gates: number; templates: number } | null>(null);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [texts, setTexts] = useState<AdminBadgeText[]>([]);
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [errorLogs, setErrorLogs] = useState<AdminErrorLog[]>([]);
  const [systemStatus, setSystemStatus] = useState<{
    app: string;
    activeVisits: number;
    activeGates: number;
    openPreRegistrationsToday: number;
    signaturesPending: number;
    signaturesFollowUp: number;
    signaturesExceptions: number;
    staleVisits: number;
    retentionDays: number | null;
    retentionEnabled: boolean;
  } | null>(null);
  const [activeSiteMap, setActiveSiteMap] = useState<SiteMapSummary>(null);
  const [siteMaps, setSiteMaps] = useState<NonNullable<SiteMapSummary>[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<AdminFieldDefinition[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAuditLogId, setSelectedAuditLogId] = useState<string | null>(null);
  const [selectedErrorLogId, setSelectedErrorLogId] = useState<string | null>(null);
  const [auditFilters, setAuditFilters] = useState({
    search: "",
    action: "",
    user: "",
    ip: "",
    from: "",
    to: ""
  });
  const [errorLogFilters, setErrorLogFilters] = useState({
    search: "",
    errorCode: "",
    path: "",
    from: "",
    to: ""
  });

  const [newGate, setNewGate] = useState({ name: "", description: "", location: "" });
  const [newUser, setNewUser] = useState<{
    username: string;
    displayName: string;
    password: string;
    role: AdminUser["role"];
    gateId: string;
    groupsText: string;
    menuAccess: AppMenuKey[];
  }>({
    username: "",
    displayName: "",
    password: "",
    role: "guard",
    gateId: "",
    groupsText: "",
    menuAccess: getAllowedMenuAccessForRole("guard")
  });
  const [siteMapName, setSiteMapName] = useState("");
  const [siteMapFile, setSiteMapFile] = useState<File | null>(null);
  const [siteMapPreviewUrl, setSiteMapPreviewUrl] = useState<string | null>(null);
  const [siteMapFieldError, setSiteMapFieldError] = useState<string | null>(null);
  const [siteMapUploading, setSiteMapUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [editableGates, setEditableGates] = useState<Record<string, AdminGate>>({});
  const [editableUsers, setEditableUsers] = useState<Record<string, EditableAdminUser>>({});
  const [editableFieldDefinitions, setEditableFieldDefinitions] = useState<Record<string, AdminFieldDefinition>>({});
  const [selectedFieldDefinitionId, setSelectedFieldDefinitionId] = useState<string | null>(null);
  const [selectedFieldSection, setSelectedFieldSection] = useState<string | null>(null);
  const [isCreateFieldModalOpen, setIsCreateFieldModalOpen] = useState(false);
  const [fieldImportText, setFieldImportText] = useState("");
  const [fieldImportFileName, setFieldImportFileName] = useState("");
  const [fieldImportPreview, setFieldImportPreview] = useState<{
    valid: boolean;
    summary: { total: number; willUpdate: number; willCreate: number; willSkip: number; warnings: string[] };
    changes: Array<{ fieldKey: string; action: "update" | "create"; label: string }>;
  } | null>(null);
  const [newFieldDefinition, setNewFieldDefinition] = useState<NewFieldDefinitionForm>({
    label: "",
    fieldType: "text",
    section: "Besucher",
    helpText: "",
    sortOrder: 100,
    showInPublic: false,
    showInGuard: true,
    showInSibe: true,
    showOnBadge: false,
    requiredPublic: false,
    requiredGuardCheckin: false,
    requiredBeforePrint: false,
    isActive: true,
    optionsJson: ""
  });

  const loadAuditLogs = useCallback(async (filters = auditFilters) => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.action.trim()) params.set("action", filters.action.trim());
    if (filters.user.trim()) params.set("user", filters.user.trim());
    if (filters.ip.trim()) params.set("ip", filters.ip.trim());
    if (filters.from.trim()) params.set("from", filters.from.trim());
    if (filters.to.trim()) params.set("to", filters.to.trim());

    const payload = await fetchJson<{ logs: AdminAuditLog[] }>(`/api/admin/audit-logs?${params.toString()}`, { method: "GET", headers: {} });
    setLogs(payload.logs);
    setSelectedAuditLogId((current) => payload.logs.some((log) => log.id === current) ? current : null);
  }, [auditFilters]);

  const loadErrorLogs = useCallback(async (filters = errorLogFilters) => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.errorCode.trim()) params.set("errorCode", filters.errorCode.trim());
    if (filters.path.trim()) params.set("path", filters.path.trim());
    if (filters.from.trim()) params.set("from", filters.from.trim());
    if (filters.to.trim()) params.set("to", filters.to.trim());

    const payload = await fetchJson<{ logs: AdminErrorLog[] }>(`/api/admin/error-logs?${params.toString()}`, { method: "GET", headers: {} });
    setErrorLogs(payload.logs);
    setSelectedErrorLogId((current) => payload.logs.some((log) => log.id === current) ? current : null);
  }, [errorLogFilters]);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [bootstrap, gatePayload, userPayload, textPayload, statusPayload, siteMapPayload, siteMapsPayload, fieldDefinitionsPayload] = await Promise.all([
        fetchJson<{ users: number; gates: number; templates: number }>("/api/admin/bootstrap", { method: "GET", headers: {} }),
        fetchJson<{ gates: AdminGate[] }>("/api/admin/gates", { method: "GET", headers: {} }),
        fetchJson<{ users: AdminUser[] }>("/api/admin/users", { method: "GET", headers: {} }),
        fetchJson<{ texts: AdminBadgeText[] }>("/api/admin/badge-texts", { method: "GET", headers: {} }),
        fetchJson<{ app: string; activeVisits: number; activeGates: number; openPreRegistrationsToday: number; signaturesPending: number; signaturesFollowUp: number; signaturesExceptions: number; staleVisits: number; retentionDays: number | null; retentionEnabled: boolean }>("/api/admin/system-status", { method: "GET", headers: {} }),
        fetchJson<{ siteMap: SiteMapSummary }>("/api/admin/site-map", { method: "GET", headers: {} }),
        fetchJson<{ siteMaps: NonNullable<SiteMapSummary>[] }>("/api/admin/site-maps", { method: "GET", headers: {} }),
        fetchJson<{ definitions: AdminFieldDefinition[] }>("/api/admin/field-definitions", { method: "GET", headers: {} })
      ]);

      setStats(bootstrap);
      setGates(gatePayload.gates);
      setUsers(userPayload.users);
      setTexts(textPayload.texts);
      setSystemStatus(statusPayload);
      setActiveSiteMap(siteMapPayload.siteMap);
      setSiteMaps(siteMapsPayload.siteMaps);
      setFieldDefinitions(fieldDefinitionsPayload.definitions);
      setEditableGates(Object.fromEntries(gatePayload.gates.map((gate) => [gate.id, { ...gate }])));
      setEditableUsers(Object.fromEntries(userPayload.users.map((entry) => [entry.id, {
        ...entry,
        password: "",
        menuAccess: entry.menuAccess?.length ? entry.menuAccess : getAllowedMenuAccessForRole(entry.role),
        groups: entry.groups ?? []
      }])));
      setEditableFieldDefinitions(Object.fromEntries(fieldDefinitionsPayload.definitions.map((field) => [field.id, { ...field }])));
      await Promise.all([
        loadAuditLogs(auditFilters),
        loadErrorLogs(errorLogFilters)
      ]);
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Admin-Daten konnten nicht geladen werden.");
    }
  }, [auditFilters, errorLogFilters, loadAuditLogs, loadErrorLogs]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!siteMapFile) {
      setSiteMapPreviewUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(siteMapFile);
    setSiteMapPreviewUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [siteMapFile]);

  useEffect(() => {
    if (!selectedFieldDefinitionId && !isCreateFieldModalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setSelectedFieldDefinitionId(null);
      setIsCreateFieldModalOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedFieldDefinitionId, isCreateFieldModalOpen]);

  async function createGate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await fetchJson("/api/admin/gates", { method: "POST", body: JSON.stringify(newGate) });
      setNewGate({ name: "", description: "", location: "" });
      setMessage("Wache angelegt.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Wache konnte nicht angelegt werden.");
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await fetchJson("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: newUser.username,
          displayName: newUser.displayName,
          password: newUser.password,
          role: newUser.role,
          gateId: null,
          groups: parseGroupText(newUser.groupsText),
          menuAccess: newUser.menuAccess
        })
      });
      setNewUser({
        username: "",
        displayName: "",
        password: "",
        role: "guard",
        gateId: "",
        groupsText: "",
        menuAccess: getAllowedMenuAccessForRole("guard")
      });
      setMessage("Benutzer angelegt.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Benutzer konnte nicht angelegt werden.");
    }
  }

  function resetSiteMapSelection() {
    setSiteMapFile(null);
    setSiteMapName("");
    setSiteMapFieldError(null);
    setDragActive(false);
  }

  function applySelectedFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) {
      return;
    }

    if (files.length > 1) {
      setSiteMapFieldError("Bitte nur eine Datei hochladen.");
      return;
    }

    const [file] = Array.from(files);
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setSiteMapFieldError("Erlaubt sind nur PNG-, JPG- und WEBP-Dateien.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setSiteMapFieldError("Die Datei ist groesser als 10 MB.");
      return;
    }

    setSiteMapFieldError(null);
    setSiteMapFile(file);
    setSiteMapName((current) => current || file.name.replace(/\.[^.]+$/, ""));
  }

  function handleSiteMapFileInput(event: ChangeEvent<HTMLInputElement>) {
    applySelectedFiles(event.target.files);
    event.target.value = "";
  }

  function handleSiteMapDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    applySelectedFiles(event.dataTransfer.files);
  }

  function parseGroupText(value: string): string[] {
    return Array.from(
      new Set(
        value
          .split(/[\n,;]+/)
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    );
  }

  function formatGroupText(groups: string[] | undefined): string {
    return (groups ?? []).join(", ");
  }

  function toggleNewUserMenuAccess(menuKey: AppMenuKey, checked: boolean) {
    setNewUser((current) => {
      const allowed = new Set(getAllowedMenuAccessForRole(current.role));
      if (!allowed.has(menuKey)) {
        return current;
      }

      const next = checked
        ? Array.from(new Set([...current.menuAccess, menuKey]))
        : current.menuAccess.filter((entry) => entry !== menuKey);

      return { ...current, menuAccess: next };
    });
  }

  function updateEditableUserRole(userId: string, role: AdminUser["role"]) {
    setEditableUsers((current) => {
      const currentEntry = current[userId];
      if (!currentEntry) {
        return current;
      }

      const allowedAccess = getAllowedMenuAccessForRole(role);
      const nextMenuAccess = currentEntry.menuAccess.filter((entry) => allowedAccess.includes(entry));

      return {
        ...current,
        [userId]: {
          ...currentEntry,
          role,
          gateId: null,
          menuAccess: nextMenuAccess.length ? nextMenuAccess : allowedAccess
        }
      };
    });
  }

  function updateEditableUserGroups(userId: string, value: string) {
    setEditableUsers((current) => {
      const currentEntry = current[userId];
      if (!currentEntry) {
        return current;
      }

      return {
        ...current,
        [userId]: {
          ...currentEntry,
          groups: parseGroupText(value)
        }
      };
    });
  }

  function toggleEditableUserMenuAccess(userId: string, menuKey: AppMenuKey, checked: boolean) {
    setEditableUsers((current) => {
      const currentEntry = current[userId];
      if (!currentEntry) {
        return current;
      }

      const allowed = new Set(getAllowedMenuAccessForRole(currentEntry.role));
      if (!allowed.has(menuKey)) {
        return current;
      }

      const nextMenuAccess = checked
        ? Array.from(new Set([...currentEntry.menuAccess, menuKey]))
        : currentEntry.menuAccess.filter((entry) => entry !== menuKey);

      return {
        ...current,
        [userId]: {
          ...currentEntry,
          menuAccess: nextMenuAccess
        }
      };
    });
  }

  async function uploadSiteMap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!siteMapFile) {
      setSiteMapFieldError("Bitte waehlen Sie eine Datei aus.");
      return;
    }

    const formData = new FormData();
    formData.append("file", siteMapFile);
    if (siteMapName.trim()) {
      formData.append("name", siteMapName.trim());
    }

    try {
      setSiteMapUploading(true);
      await fetchJson("/api/admin/site-map/upload", {
        method: "POST",
        body: formData
      });
      resetSiteMapSelection();
      setMessage("Gelaendeplan hochgeladen und aktiviert.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      const fieldErrors = extractFieldErrors(payload);
      if (fieldErrors.file) {
        setSiteMapFieldError(fieldErrors.file);
      }
      setError(payload.message || "Gelaendeplan konnte nicht hochgeladen werden.");
    } finally {
      setSiteMapUploading(false);
    }
  }

  async function activateSiteMap(siteMapId: string) {
    try {
      await fetchJson(`/api/admin/site-maps/${siteMapId}/activate`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage("Gelaendeplan aktiviert.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Gelaendeplan konnte nicht aktiviert werden.");
    }
  }

  async function saveGate(gateId: string) {
    const gate = editableGates[gateId];
    if (!gate) return;
    try {
      await fetchJson(`/api/admin/gates/${gateId}`, {
        method: "PUT",
        body: JSON.stringify(gate)
      });
      setMessage("Wache aktualisiert.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Wache konnte nicht aktualisiert werden.");
    }
  }

  async function saveUser(userId: string) {
    const adminUser = editableUsers[userId];
    if (!adminUser) return;
    try {
      await fetchJson(`/api/admin/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({
          username: adminUser.username,
          displayName: adminUser.displayName,
          role: adminUser.role,
          gateId: null,
          isActive: adminUser.isActive,
          groups: adminUser.groups,
          menuAccess: adminUser.menuAccess,
          ...(adminUser.password ? { password: adminUser.password } : {})
        })
      });
      setMessage("Benutzer aktualisiert.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Benutzer konnte nicht aktualisiert werden.");
    }
  }

  async function saveFieldDefinition(fieldId: string) {
    const field = editableFieldDefinitions[fieldId];
    if (!field) return;

    try {
      await fetchJson(`/api/admin/field-definitions/${fieldId}`, {
        method: "PUT",
        body: JSON.stringify({
          label: field.label,
          section: field.section,
          isActive: field.isActive,
          showInPublic: field.showInPublic,
          showInGuard: field.showInGuard,
          showInSibe: field.showInSibe,
          showOnBadge: field.showOnBadge,
          requiredPublic: field.requiredPublic,
          requiredGuardCheckin: field.requiredGuardCheckin,
          requiredBeforePrint: field.requiredBeforePrint,
          sortOrder: field.sortOrder,
          helpText: field.helpText || "",
          optionsJson: field.optionsJson || ""
        })
      });
      setMessage("Felddefinition gespeichert.");
      setError(null);
      setSelectedFieldDefinitionId(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Felddefinition konnte nicht gespeichert werden.");
    }
  }

  async function createFieldDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await fetchJson("/api/admin/field-definitions", {
        method: "POST",
        body: JSON.stringify({
          ...newFieldDefinition,
          optionsJson: newFieldDefinition.optionsJson?.trim() || null
        })
      });
      setMessage("Feld angelegt.");
      setError(null);
      setIsCreateFieldModalOpen(false);
      setNewFieldDefinition({
        label: "",
        fieldType: "text",
        section: selectedFieldSection || "Besucher",
        helpText: "",
        sortOrder: 100,
        showInPublic: false,
        showInGuard: true,
        showInSibe: true,
        showOnBadge: false,
        requiredPublic: false,
        requiredGuardCheckin: false,
        requiredBeforePrint: false,
        isActive: true,
        optionsJson: ""
      });
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Feld konnte nicht angelegt werden.");
    }
  }

  async function toggleFieldDefinitionActive(field: AdminFieldDefinition) {
    try {
      await fetchJson(`/api/admin/field-definitions/${field.id}`, {
        method: "PUT",
        body: JSON.stringify({
          label: field.label,
          section: field.section,
          isActive: !field.isActive,
          showInPublic: field.isActive ? false : field.showInPublic,
          showInGuard: field.isActive ? false : field.showInGuard,
          showInSibe: field.isActive ? false : field.showInSibe,
          showOnBadge: field.isActive ? false : field.showOnBadge,
          requiredPublic: field.isActive ? false : field.requiredPublic,
          requiredGuardCheckin: field.isActive ? false : field.requiredGuardCheckin,
          requiredBeforePrint: field.isActive ? false : field.requiredBeforePrint,
          sortOrder: field.sortOrder,
          helpText: field.helpText || "",
          optionsJson: field.optionsJson || ""
        })
      });
      setMessage(field.isActive ? "Feld ausgeblendet." : "Feld reaktiviert.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Feldstatus konnte nicht geaendert werden.");
    }
  }

  async function exportFieldConfiguration() {
    try {
      const payload = await fetchJson<FieldConfigExportPayload>("/api/admin/field-definitions/export", {
        method: "GET",
        headers: {}
      });
      const date = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `besucher-manager-field-config-${date}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setMessage("Feldkonfiguration exportiert.");
      setError(null);
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Export der Feldkonfiguration fehlgeschlagen.");
    }
  }

  async function handleImportConfigFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      setFieldImportText(text);
      setFieldImportFileName(file.name);
      setFieldImportPreview(null);
      setMessage(null);
      setError(null);
    } catch {
      setError("Datei konnte nicht gelesen werden.");
    }
  }

  async function previewFieldImport() {
    if (!fieldImportText.trim()) {
      setError("Bitte zuerst eine JSON-Datei fuer den Import auswaehlen.");
      return;
    }

    try {
      const parsed = JSON.parse(fieldImportText);
      const preview = await fetchJson<{
        valid: boolean;
        summary: { total: number; willUpdate: number; willCreate: number; willSkip: number; warnings: string[] };
        changes: Array<{ fieldKey: string; action: "update" | "create"; label: string }>;
      }>("/api/admin/field-definitions/import/preview", {
        method: "POST",
        body: JSON.stringify(parsed)
      });
      setFieldImportPreview(preview);
      setMessage("Importvorschau erstellt.");
      setError(null);
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Importvorschau fehlgeschlagen.");
      setFieldImportPreview(null);
    }
  }

  async function confirmFieldImport() {
    if (!fieldImportText.trim()) {
      setError("Bitte zuerst eine JSON-Datei fuer den Import auswaehlen.");
      return;
    }

    try {
      const parsed = JSON.parse(fieldImportText);
      const result = await fetchJson<{ imported: boolean; summary: { total: number; updated: number; created: number; skipped: number } }>(
        "/api/admin/field-definitions/import",
        {
          method: "POST",
          body: JSON.stringify(parsed)
        }
      );
      setMessage(`Feldkonfiguration importiert. Aktualisiert: ${result.summary.updated}, neu: ${result.summary.created}.`);
      setError(null);
      setFieldImportPreview(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Import fehlgeschlagen.");
    }
  }

  async function toggleGateActive(gateId: string, active: boolean) {
    try {
      await fetchJson(`/api/admin/gates/${gateId}/${active ? "reactivate" : "deactivate"}`, { method: "POST", body: JSON.stringify({}) });
      setMessage(active ? "Wache reaktiviert." : "Wache deaktiviert.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Wache konnte nicht aktualisiert werden.");
    }
  }

  async function toggleUserActive(userId: string, active: boolean) {
    try {
      await fetchJson(`/api/admin/users/${userId}/${active ? "reactivate" : "deactivate"}`, { method: "POST", body: JSON.stringify({}) });
      setMessage(active ? "Benutzer reaktiviert." : "Benutzer deaktiviert.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Benutzer konnte nicht aktualisiert werden.");
    }
  }

  async function deleteUser(userEntry: AdminUser) {
    const confirmed = window.confirm(
      `Benutzer "${userEntry.username}" loeschen?\n\nWenn der Benutzer bereits mit Besuchen, Auditlogs oder anderen Daten verknuepft ist, wird er sicher deaktiviert statt hart geloescht.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const result = await fetchJson<{ success: boolean; deleted: boolean; softDeleted: boolean; message?: string }>(`/api/admin/users/${userEntry.id}`, {
        method: "DELETE",
        body: JSON.stringify({})
      });
      setMessage(result.message || (result.deleted ? "Benutzer geloescht." : "Benutzer deaktiviert."));
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Benutzer konnte nicht geloescht werden.");
    }
  }

  async function applyAuditFilters() {
    try {
      setError(null);
      await loadAuditLogs(auditFilters);
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Auditlog konnte nicht gefiltert werden.");
    }
  }

  async function resetAuditFilters() {
    const cleared = { search: "", action: "", user: "", ip: "", from: "", to: "" };
    setAuditFilters(cleared);
    try {
      setError(null);
      await loadAuditLogs(cleared);
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Auditlog konnte nicht geladen werden.");
    }
  }

  const selectedAuditLog = logs.find((entry) => entry.id === selectedAuditLogId) || null;
  const selectedErrorLog = errorLogs.find((entry) => entry.id === selectedErrorLogId) || null;

  async function applyErrorLogFilters() {
    await loadErrorLogs(errorLogFilters);
  }

  async function resetErrorLogFilters() {
    const next = {
      search: "",
      errorCode: "",
      path: "",
      from: "",
      to: ""
    };
    setErrorLogFilters(next);
    await loadErrorLogs(next);
  }
  const selectedFieldDefinition = selectedFieldDefinitionId ? editableFieldDefinitions[selectedFieldDefinitionId] || null : null;
  const fieldSectionOrder = ["Besucher", "Adresse", "Ansprechpartner", "Besuch", "Ausweis", "Ziel/Raum", "Sonstiges"];
  const hiddenSections = new Set(["Geraete", "Mitgefuehrte Geraete"]);
  const hiddenFieldKeys = new Set(["visitor_address", "id_document_issuing_place"]);
  const fieldSectionDescriptions: Record<string, string> = {
    Besucher: "Daten zur besuchenden Person.",
    Adresse: "Strukturierte Adressdaten für Check-in und Druck.",
    Ansprechpartner: "Kontakt zur empfangenden Person im Unternehmen.",
    Besuch: "Besuchszweck, Gültigkeitszeitraum und Ablaufdaten.",
    Ausweis: "Ausweisdaten für Voranmeldung und Wache.",
    "Ziel/Raum": "Interne Ziel-, Gebäude- und Raumangaben.",
    Sonstiges: "Zusatzfelder ohne feste Kategorie."
  };
  const groupedFieldDefinitions = useMemo(() => {
    const bySection = new Map<string, AdminFieldDefinition[]>();
    for (const item of fieldDefinitions) {
      if (hiddenSections.has(item.section?.trim() || "") || hiddenFieldKeys.has(item.fieldKey)) {
        continue;
      }
      const section = item.section?.trim() || "Sonstiges";
      if (!bySection.has(section)) {
        bySection.set(section, []);
      }
      bySection.get(section)?.push(item);
    }
    for (const list of bySection.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    }

    const orderedKeys = [
      ...fieldSectionOrder.filter((key) => bySection.has(key)),
      ...Array.from(bySection.keys()).filter((key) => !fieldSectionOrder.includes(key)).sort((a, b) => a.localeCompare(b))
    ];

    return orderedKeys.map((section) => ({ section, items: bySection.get(section) || [] }));
  }, [fieldDefinitions]);
  const selectedFieldSectionGroup = selectedFieldSection
    ? groupedFieldDefinitions.find((entry) => entry.section === selectedFieldSection) || null
    : null;

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
        <div className="section-header">
          <div>
            <h2>Admin</h2>
          </div>
        </div>

        <div className="section-tabs">
          <button type="button" className={activeSection === "dashboard" ? "tab-button tab-active" : "tab-button"} onClick={() => setActiveSection("dashboard")}>Dashboard</button>
          <button type="button" className={activeSection === "wachen" ? "tab-button tab-active" : "tab-button"} onClick={() => setActiveSection("wachen")}>Wachen</button>
          <button type="button" className={activeSection === "benutzer" ? "tab-button tab-active" : "tab-button"} onClick={() => setActiveSection("benutzer")}>Benutzer</button>
          <button type="button" className={activeSection === "texte" ? "tab-button tab-active" : "tab-button"} onClick={() => setActiveSection("texte")}>Texte</button>
          <button type="button" className={activeSection === "karte" ? "tab-button tab-active" : "tab-button"} onClick={() => setActiveSection("karte")}>Karte</button>
          <button type="button" className={activeSection === "felder" ? "tab-button tab-active" : "tab-button"} onClick={() => setActiveSection("felder")}>Felder</button>
          <button type="button" className={activeSection === "audit" ? "tab-button tab-active" : "tab-button"} onClick={() => setActiveSection("audit")}>Audit</button>
          <button type="button" className={activeSection === "fehler" ? "tab-button tab-active" : "tab-button"} onClick={() => setActiveSection("fehler")}>Fehlerlog</button>
          <button type="button" className={activeSection === "system" ? "tab-button tab-active" : "tab-button"} onClick={() => setActiveSection("system")}>System</button>
        </div>

        {message ? <Alert type="success">{message}</Alert> : null}
        {error ? <Alert type="error">{error}</Alert> : null}

        {activeSection === "dashboard" ? (
          <AdminDashboardSection
            gates={gates}
            users={users}
            texts={texts}
            activeSiteMap={activeSiteMap}
            fieldDefinitions={fieldDefinitions}
            logs={logs}
            errorLogs={errorLogs}
            systemStatus={systemStatus}
            onOpenSection={setActiveSection}
          />
        ) : null}

        {activeSection === "wachen" ? (
          <AdminGatesSection
            newGate={newGate}
            setNewGate={setNewGate}
            createGate={createGate}
            gates={gates}
            editableGates={editableGates}
            setEditableGates={setEditableGates}
            saveGate={saveGate}
            toggleGateActive={toggleGateActive}
          />
        ) : null}

        {activeSection === "benutzer" ? (
          <AdminUsersSection
            newUser={newUser}
            setNewUser={setNewUser}
            menuOptions={menuOptions}
            createUser={createUser}
            users={users}
            editableUsers={editableUsers}
            setEditableUsers={setEditableUsers}
            updateEditableUserRole={updateEditableUserRole}
            updateEditableUserGroups={updateEditableUserGroups}
            formatGroupText={formatGroupText}
            toggleNewUserMenuAccess={toggleNewUserMenuAccess}
            toggleEditableUserMenuAccess={toggleEditableUserMenuAccess}
            saveUser={saveUser}
            toggleUserActive={toggleUserActive}
            deleteUser={deleteUser}
            currentUserId={currentUser?.id}
          />
        ) : null}

        {activeSection === "karte" ? (
          <AdminSiteMapSection
            uploadSiteMap={uploadSiteMap}
            siteMapName={siteMapName}
            setSiteMapName={setSiteMapName}
            dragActive={dragActive}
            setDragActive={setDragActive}
            handleSiteMapDrop={handleSiteMapDrop}
            handleSiteMapFileInput={handleSiteMapFileInput}
            siteMapFile={siteMapFile}
            siteMapFieldError={siteMapFieldError}
            siteMapPreviewUrl={siteMapPreviewUrl}
            siteMapUploading={siteMapUploading}
            resetSiteMapSelection={resetSiteMapSelection}
            activeSiteMap={activeSiteMap}
            siteMaps={siteMaps}
            activateSiteMap={activateSiteMap}
          />
        ) : null}

        {activeSection === "texte" ? (
          <BadgeTextManager description="" />
        ) : null}

        {activeSection === "felder" ? (
          <Card className="admin-fields-card">
            <h3>Feldkonfiguration</h3>
            <p className="section-copy">Konfigurieren Sie die Felder als Modul-Baukasten. Oeffnen Sie ein Modul, um nur die dazugehoerigen Felder zu bearbeiten.</p>
            <div className="panel field-config-transfer">
              <h4>Import / Export</h4>
              <p className="section-copy">Import-Modus: Zusammenfuehren. Vorhandene Felder werden anhand ihres Keys aktualisiert, nicht enthaltene Felder bleiben erhalten.</p>
              <div className="row-actions action-bar">
                <button type="button" onClick={() => void exportFieldConfiguration()}>Konfiguration exportieren</button>
                <label className="secondary-button file-button-inline">
                  JSON-Datei auswaehlen
                  <input type="file" accept="application/json,.json" onChange={(event) => void handleImportConfigFile(event)} />
                </label>
                <button type="button" className="secondary-button" onClick={() => void previewFieldImport()} disabled={!fieldImportText.trim()}>
                  Import pruefen
                </button>
              </div>
              {fieldImportFileName ? <p className="section-copy">Datei: {fieldImportFileName}</p> : null}
              {fieldImportPreview ? (
                <div className="panel field-import-preview">
                  <p>
                    <strong>{fieldImportPreview.summary.total}</strong> Felder ·
                    {" "}<strong>{fieldImportPreview.summary.willUpdate}</strong> aktualisiert ·
                    {" "}<strong>{fieldImportPreview.summary.willCreate}</strong> neu
                  </p>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Feld</th><th>Aktion</th><th>Label</th></tr></thead>
                      <tbody>
                        {fieldImportPreview.changes.map((item) => (
                          <tr key={item.fieldKey}>
                            <td><code>{item.fieldKey}</code></td>
                            <td>{item.action === "update" ? "Update" : "Neu"}</td>
                            <td>{item.label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="row-actions action-bar">
                    <button type="button" onClick={() => void confirmFieldImport()}>Import bestaetigen</button>
                  </div>
                </div>
              ) : null}
            </div>

            {selectedFieldSectionGroup ? (
              <div className="field-module-detail">
                <div className="field-module-header">
                  <div>
                    <p className="eyebrow">Modul</p>
                    <h4>{selectedFieldSectionGroup.section}</h4>
                    <p className="section-copy">{fieldSectionDescriptions[selectedFieldSectionGroup.section] || "Feldgruppe fuer diesen Bereich."}</p>
                  </div>
                  <div className="row-actions action-bar">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setSelectedFieldSection(null);
                        setSelectedFieldDefinitionId(null);
                      }}
                    >
                      Zurueck zur Moduluebersicht
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewFieldDefinition((current) => ({ ...current, section: selectedFieldSectionGroup.section }));
                        setIsCreateFieldModalOpen(true);
                      }}
                    >
                      Neues Feld hinzufuegen
                    </button>
                  </div>
                </div>
                <div className="field-section-list">
                  {selectedFieldSectionGroup.items.map((definition) => (
                    <div key={definition.id} className="field-row-card">
                      <div className="field-row-main">
                        <div className="field-row-title">{definition.label}</div>
                        <div className="field-row-meta">
                          <span className="field-row-key">{definition.fieldKey}</span>
                          <span>{definition.fieldType}</span>
                        </div>
                      </div>
                      <div className="field-row-badges">
                        {definition.isSystem ? <span className="field-config-badge">Systemfeld</span> : <span className="field-config-badge">Eigenes Feld</span>}
                        {definition.isActive ? <span className="field-config-badge">Aktiv</span> : <span className="field-config-badge">Inaktiv</span>}
                        {definition.showInPublic ? <span className="field-config-badge">Voranmeldung</span> : null}
                        {definition.showInGuard ? <span className="field-config-badge">Wache</span> : null}
                        {definition.showInSibe ? <span className="field-config-badge">SiBe</span> : null}
                        {definition.showOnBadge ? <span className="field-config-badge">Druck</span> : null}
                        {definition.requiredPublic ? <span className="field-config-badge">Pflicht Voranmeldung</span> : null}
                        {definition.requiredGuardCheckin ? <span className="field-config-badge">Pflicht Check-in</span> : null}
                        {definition.requiredBeforePrint ? <span className="field-config-badge">Pflicht Druck</span> : null}
                      </div>
                      <div className="field-row-actions">
                        <button type="button" className="secondary-button" onClick={() => setSelectedFieldDefinitionId(definition.id)}>
                          Bearbeiten
                        </button>
                        <button type="button" className="secondary-button" onClick={() => void toggleFieldDefinitionActive(definition)}>
                          {definition.isActive ? "Ausblenden" : "Reaktivieren"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="field-section-grid">
                {groupedFieldDefinitions.map(({ section, items }) => {
                  const activeCount = items.filter((item) => item.isActive).length;
                  const requiredPublicCount = items.filter((item) => item.requiredPublic && item.isActive).length;
                  const requiredCheckinCount = items.filter((item) => item.requiredGuardCheckin && item.isActive).length;
                  const requiredPrintCount = items.filter((item) => item.requiredBeforePrint && item.isActive).length;
                  const printCount = items.filter((item) => item.showOnBadge && item.isActive).length;
                  return (
                    <article key={section} className="field-section-card">
                      <div className="field-section-summary">
                        <h4>{section}</h4>
                        <p>{fieldSectionDescriptions[section] || "Feldgruppe fuer diesen Bereich."}</p>
                      </div>
                      <ul className="field-module-stats">
                        <li>{activeCount} aktive Felder</li>
                        <li>{requiredPublicCount} Pflicht in Voranmeldung</li>
                        <li>{requiredCheckinCount} Pflicht vor Check-in</li>
                        <li>{requiredPrintCount} Pflicht vor Druck</li>
                        <li>{printCount} Druckfelder</li>
                      </ul>
                      <div className="field-row-actions">
                        <button type="button" className="secondary-button" onClick={() => setSelectedFieldSection(section)}>
                          Oeffnen
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFieldSection(section);
                            setNewFieldDefinition((current) => ({ ...current, section }));
                            setIsCreateFieldModalOpen(true);
                          }}
                        >
                          Neues Feld in diesem Modul
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <details className="field-expert-details">
              <summary>Expertenansicht anzeigen</summary>
              <div className="table-wrap admin-fields-wrap">
                <table className="data-table admin-fields-table">
                  <thead>
                    <tr>
                      <th className="col-label">Label</th>
                      <th className="col-key">Key</th>
                      <th className="col-type">Typ</th>
                      <th className="col-section">Bereich</th>
                      <th className="col-flag">System</th>
                      <th className="col-flag">Aktiv</th>
                      <th className="col-flag">Public</th>
                      <th className="col-flag">Wache</th>
                      <th className="col-flag">SiBe</th>
                      <th className="col-flag">Druck</th>
                      <th className="col-flag">Pflicht Public</th>
                      <th className="col-flag">Pflicht Check-in</th>
                      <th className="col-flag">Pflicht Druck</th>
                      <th className="col-order">Sortierung</th>
                      <th className="col-actions">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldDefinitions.map((definition) => (
                      <tr key={definition.id}>
                        <td className="col-label">{definition.label}</td>
                        <td className="col-key"><code>{definition.fieldKey}</code></td>
                        <td className="col-type">{definition.fieldType}</td>
                        <td className="col-section">{definition.section}</td>
                        <td className="col-flag">{definition.isSystem ? "Ja" : "Nein"}</td>
                        <td className="col-flag">{definition.isActive ? "Ja" : "Nein"}</td>
                        <td className="col-flag">{definition.showInPublic ? "Ja" : "Nein"}</td>
                        <td className="col-flag">{definition.showInGuard ? "Ja" : "Nein"}</td>
                        <td className="col-flag">{definition.showInSibe ? "Ja" : "Nein"}</td>
                        <td className="col-flag">{definition.showOnBadge ? "Ja" : "Nein"}</td>
                        <td className="col-flag">{definition.requiredPublic ? "Ja" : "Nein"}</td>
                        <td className="col-flag">{definition.requiredGuardCheckin ? "Ja" : "Nein"}</td>
                        <td className="col-flag">{definition.requiredBeforePrint ? "Ja" : "Nein"}</td>
                        <td className="col-order">{definition.sortOrder}</td>
                        <td className="col-actions">
                          <button type="button" className="secondary-button" onClick={() => setSelectedFieldDefinitionId(definition.id)}>
                            Bearbeiten
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {selectedFieldDefinition ? (
              <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setSelectedFieldDefinitionId(null);
                }
              }}>
                <div className="modal-card panel field-edit-modal">
                  <div className="modal-header">
                    <h4>Feld bearbeiten</h4>
                    <button type="button" className="secondary-button modal-close-button" onClick={() => setSelectedFieldDefinitionId(null)}>
                      Schliessen
                    </button>
                  </div>
                  <div className="field-edit-form">
                    <h5>Stammdaten</h5>
                    <div className="form-grid two-columns">
                      <FormField label="Label">
                        <input
                          value={selectedFieldDefinition.label}
                          onChange={(event) => setEditableFieldDefinitions((current) => ({
                            ...current,
                            [selectedFieldDefinition.id]: { ...selectedFieldDefinition, label: event.target.value }
                          }))}
                        />
                      </FormField>
                      <FormField label="Key">
                        <input value={selectedFieldDefinition.fieldKey} readOnly />
                      </FormField>
                      <FormField label="Typ">
                        <input value={selectedFieldDefinition.fieldType} readOnly />
                      </FormField>
                      <FormField label="Bereich">
                        <input
                          value={selectedFieldDefinition.section}
                          onChange={(event) => setEditableFieldDefinitions((current) => ({
                            ...current,
                            [selectedFieldDefinition.id]: { ...selectedFieldDefinition, section: event.target.value }
                          }))}
                        />
                      </FormField>
                      <FormField label="Sortierung">
                        <input
                          type="number"
                          value={selectedFieldDefinition.sortOrder}
                          onChange={(event) => setEditableFieldDefinitions((current) => ({
                            ...current,
                            [selectedFieldDefinition.id]: { ...selectedFieldDefinition, sortOrder: Number(event.target.value) || 0 }
                          }))}
                        />
                      </FormField>
                      <FormField label="Hilfetext">
                        <input
                          value={selectedFieldDefinition.helpText || ""}
                          onChange={(event) => setEditableFieldDefinitions((current) => ({
                            ...current,
                            [selectedFieldDefinition.id]: { ...selectedFieldDefinition, helpText: event.target.value }
                          }))}
                        />
                      </FormField>
                    </div>

                    <h5>Sichtbarkeit</h5>
                    <p className="section-copy">Legen Sie fest, in welchem Bereich dieses Feld sichtbar ist.</p>
                    <div className="form-grid two-columns">
                      <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.showInPublic} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, showInPublic: event.target.checked } }))} />In Voranmeldung anzeigen<div className="field-help-text">Dieses Feld erscheint im Formular fuer Mitarbeiter ohne Login.</div></label>
                      <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.showInGuard} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, showInGuard: event.target.checked } }))} />In Wache anzeigen<div className="field-help-text">Dieses Feld ist in der Wache-Detailansicht sichtbar und bearbeitbar.</div></label>
                      <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.showInSibe} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, showInSibe: event.target.checked } }))} />In SiBe anzeigen<div className="field-help-text">Dieses Feld ist in der lesenden SiBe-Ansicht sichtbar.</div></label>
                      <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.showOnBadge} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, showOnBadge: event.target.checked } }))} />Auf Besucherschein drucken<div className="field-help-text">Dieses Feld wird auf dem Druckschein ausgegeben.</div></label>
                    </div>

                    <h5>Pflichtregeln</h5>
                    <p className="section-copy">Pflichtregeln steuern, wann ein Feld zwingend ausgefuellt sein muss.</p>
                    <div className="form-grid two-columns">
                      <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.requiredPublic} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, requiredPublic: event.target.checked } }))} />Pflicht in Voranmeldung<div className="field-help-text">Mitarbeiter muessen dieses Feld beim Anmelden ausfuellen.</div></label>
                      <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.requiredGuardCheckin} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, requiredGuardCheckin: event.target.checked } }))} />Pflicht vor Check-in<div className="field-help-text">Die Wache muss dieses Feld vor dem Check-in ergaenzen.</div></label>
                      <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.requiredBeforePrint} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, requiredBeforePrint: event.target.checked } }))} />Pflicht vor Druck<div className="field-help-text">Der Besucherschein darf erst nach Ergaenzung gedruckt werden.</div></label>
                    </div>

                    <h5>Status</h5>
                    <div className="form-grid two-columns">
                      <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.isActive} onChange={(event) => setEditableFieldDefinitions((current) => ({ ...current, [selectedFieldDefinition.id]: { ...selectedFieldDefinition, isActive: event.target.checked } }))} />Aktiv<div className="field-help-text">Inaktive Felder bleiben in Daten erhalten, werden aber nicht mehr aktiv verwendet.</div></label>
                      <label className="checkbox-row"><input type="checkbox" checked={selectedFieldDefinition.isSystem} readOnly disabled />Systemfeld<div className="field-help-text">Systemfelder gehoeren zum Grundsystem und sind nicht loeschbar.</div></label>
                    </div>
                  </div>
                  <div className="row-actions action-bar modal-actions">
                    <button type="button" onClick={() => void saveFieldDefinition(selectedFieldDefinition.id)}>Speichern</button>
                    <button type="button" className="secondary-button" onClick={() => setSelectedFieldDefinitionId(null)}>Abbrechen</button>
                  </div>
                </div>
              </div>
            ) : null}

            {isCreateFieldModalOpen ? (
              <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setIsCreateFieldModalOpen(false);
                }
              }}>
                <div className="modal-card panel field-edit-modal">
                  <div className="modal-header">
                    <h4>Neues Feld hinzufuegen</h4>
                    <button type="button" className="secondary-button modal-close-button" onClick={() => setIsCreateFieldModalOpen(false)}>
                      Schliessen
                    </button>
                  </div>
                  <form className="field-edit-form" onSubmit={createFieldDefinition}>
                    <h5>Stammdaten</h5>
                    <div className="form-grid two-columns">
                      <FormField label="Label" required><input value={newFieldDefinition.label} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, label: event.target.value }))} /></FormField>
                      <FormField label="Feldtyp" required>
                        <select value={newFieldDefinition.fieldType} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, fieldType: event.target.value }))}>
                          <option value="text">Text</option>
                          <option value="textarea">Mehrzeiliger Text</option>
                          <option value="date">Datum</option>
                          <option value="email">E-Mail</option>
                          <option value="phone">Telefon</option>
                          <option value="number">Zahl</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="select">Auswahlfeld</option>
                        </select>
                      </FormField>
                      <FormField label="Bereich" required><input value={newFieldDefinition.section} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, section: event.target.value }))} /></FormField>
                      <FormField label="Sortierung"><input type="number" value={newFieldDefinition.sortOrder} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} /></FormField>
                      <FormField label="Hilfetext"><input value={newFieldDefinition.helpText} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, helpText: event.target.value }))} /></FormField>
                      {newFieldDefinition.fieldType === "select" ? <FormField label="Optionen (eine pro Zeile)"><textarea rows={4} value={newFieldDefinition.optionsJson} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, optionsJson: event.target.value }))} /></FormField> : null}
                    </div>

                    <h5>Sichtbarkeit</h5>
                    <div className="form-grid two-columns">
                      <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.showInPublic} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, showInPublic: event.target.checked }))} />In Voranmeldung anzeigen</label>
                      <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.showInGuard} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, showInGuard: event.target.checked }))} />In Wache anzeigen</label>
                      <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.showInSibe} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, showInSibe: event.target.checked }))} />In SiBe anzeigen</label>
                      <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.showOnBadge} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, showOnBadge: event.target.checked }))} />Auf Besucherschein drucken</label>
                    </div>

                    <h5>Pflichtregeln</h5>
                    <div className="form-grid two-columns">
                      <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.requiredPublic} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, requiredPublic: event.target.checked }))} />Pflicht in Voranmeldung</label>
                      <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.requiredGuardCheckin} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, requiredGuardCheckin: event.target.checked }))} />Pflicht vor Check-in</label>
                      <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.requiredBeforePrint} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, requiredBeforePrint: event.target.checked }))} />Pflicht vor Druck</label>
                      <label className="checkbox-row"><input type="checkbox" checked={newFieldDefinition.isActive} onChange={(event) => setNewFieldDefinition((current) => ({ ...current, isActive: event.target.checked }))} />Aktiv</label>
                    </div>
                    <div className="row-actions action-bar modal-actions">
                      <button type="submit">Feld anlegen</button>
                      <button type="button" className="secondary-button" onClick={() => setIsCreateFieldModalOpen(false)}>Abbrechen</button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </Card>
        ) : null}

        {activeSection === "system" ? (
          <AdminSystemSection systemStatus={systemStatus} />
        ) : null}

        {activeSection === "audit" ? (
          <AdminAuditSection
            auditFilters={auditFilters}
            setAuditFilters={setAuditFilters}
            applyAuditFilters={applyAuditFilters}
            resetAuditFilters={resetAuditFilters}
            logs={logs}
            selectedAuditLog={selectedAuditLog}
            setSelectedAuditLogId={setSelectedAuditLogId}
          />
        ) : null}

        {activeSection === "fehler" ? (
          <AdminErrorLogSection
            errorLogFilters={errorLogFilters}
            setErrorLogFilters={setErrorLogFilters}
            applyErrorLogFilters={applyErrorLogFilters}
            resetErrorLogFilters={resetErrorLogFilters}
            errorLogs={errorLogs}
            selectedErrorLog={selectedErrorLog}
            setSelectedErrorLogId={setSelectedErrorLogId}
          />
        ) : null}
      </main>
    </AppLayout>
  );
}
