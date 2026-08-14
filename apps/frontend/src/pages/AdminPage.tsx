import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useState,
  type FormEvent
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  AdminAuditSection,
  AdminBackgroundSection,
  AdminDashboardSection,
  AdminErrorLogSection,
  type AdminSectionKey,
  AdminGatesSection,
  AdminSiteMapSection,
  AdminSystemSection,
  AdminUsersSection,
  AdminDataRetentionSection,
  type AdminRetentionSettings
} from "../components/admin/AdminSections";
import { AdminFieldDefinitionsSection } from "../components/admin/AdminFieldDefinitionsSection";
import { Alert } from "../components/ui";
import { BadgeTextManager } from "../components/BadgeTextManager";
import {
  type AppPermission,
  type AppMenuKey,
  AppLayout,
  type AdminAuditLog,
  type AdminBadgeText,
  type AdminErrorLog,
  type AdminLogDetail,
  type AdminFieldDefinition,
  type AdminGate,
  type AdminSiteMap,
  type AdminUiBackground,
  type AdminWorkflowSettings,
  type AdminUser,
  type ApiError,
  type EditableAdminUser,
  type FieldConfigExportPayload,
  fetchJson,
  getDefaultPermissionsForRole,
  getAllowedMenuAccessForRole,
  hasPermission,
  type UserPermissions,
  useAuth,
  useThemeMode
} from "../app/core";

export function AdminPage() {
  const { user: currentUser } = useAuth();
  const { setBackgroundMode, setBackgroundImageUrl } = useThemeMode();
  const menuOptions: Array<{ key: AppMenuKey; label: string }> = [
    { key: "voranmeldung", label: "Voranmeldung" },
    { key: "wache", label: "Wache" },
    { key: "import", label: "Import" },
    { key: "admin", label: "Admin" },
    { key: "sibe", label: "SiBe" },
    { key: "laenderbenachrichtigungen", label: "Länderbenachrichtigungen" },
    { key: "kaskdt", label: "KasKdt" },
    { key: "texte", label: "Texte" }
  ];
  const permissionGroups: Array<{ title: string; items: Array<{ key: AppPermission; label: string }> }> = [
    {
      title: "Besucher",
      items: [
        { key: "visits.read", label: "Besucher lesen" },
        { key: "visits.create", label: "Besucher erstellen" },
        { key: "visits.update", label: "Besucher bearbeiten" },
        { key: "visits.delete", label: "Besucher archivieren" },
        { key: "visits.checkIn", label: "Check-in" },
        { key: "visits.checkOut", label: "Check-out" },
        { key: "visits.printBadge", label: "Ausweis drucken" }
      ]
    },
    {
      title: "Verwaltung",
      items: [
        { key: "imports.execute", label: "Import ausführen" },
        { key: "dashboards.sibe", label: "SiBe-Übersicht" },
        { key: "dashboards.commander", label: "KasKdt-Lagebild" },
        { key: "admin.users", label: "Benutzer verwalten" },
        { key: "admin.guards", label: "Wachen verwalten" },
        { key: "texts.manage", label: "Texte verwalten" },
        { key: "admin.map", label: "Geländeplan verwalten" },
        { key: "admin.fields", label: "Felder verwalten" },
        { key: "admin.system", label: "System verwalten" }
      ]
    },
    {
      title: "Protokolle",
      items: [
        { key: "logs.audit", label: "Auditlog ansehen" },
        { key: "logs.errors", label: "Fehlerlog ansehen" }
      ]
    }
  ];
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState<AdminSectionKey>(() => (searchParams.get("section") as AdminSectionKey) || "dashboard");
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [texts, setTexts] = useState<AdminBadgeText[]>([]);
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [errorLogs, setErrorLogs] = useState<AdminErrorLog[]>([]);
  const [systemStatus, setSystemStatus] = useState<{
    app: string;
    appVersion: string;
    schemaVersion: number;
    activeVisits: number;
    activeGates: number;
    openPreRegistrationsToday: number;
    signaturesPending: number;
    signaturesFollowUp: number;
    signaturesExceptions: number;
    dbHost?: string;
    dbName?: string;
  } | null>(null);
  const [workflowSettings, setWorkflowSettings] = useState<AdminWorkflowSettings | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [uiBackgrounds, setUiBackgrounds] = useState<AdminUiBackground[]>([]);
  const [uiBackgroundSaving, setUiBackgroundSaving] = useState(false);
  const [workflowPassword, setWorkflowPassword] = useState("");
  const [workflowTestRecipient, setWorkflowTestRecipient] = useState("");
  const [workflowTestKind, setWorkflowTestKind] = useState<"relay" | "nationality" | "pre_registration" | "reminder">("relay");
  const [userImportFile, setUserImportFile] = useState<File | null>(null);
  const [userImporting, setUserImporting] = useState(false);
  const [userImportIssues, setUserImportIssues] = useState<Array<{ lineNumber: number; username: string | null; message: string }>>([]);
  const [userImportSummary, setUserImportSummary] = useState<{ created: number; updated: number; total: number; fileName: string } | null>(null);
  const [activeSiteMap, setActiveSiteMap] = useState<AdminSiteMap | null>(null);
  const [siteMaps, setSiteMaps] = useState<AdminSiteMap[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<AdminFieldDefinition[]>([]);
  const [retentionSettings, setRetentionSettings] = useState<AdminRetentionSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAuditLogId, setSelectedAuditLogId] = useState<string | null>(() => searchParams.get("auditId"));
  const [selectedErrorLogId, setSelectedErrorLogId] = useState<string | null>(() => searchParams.get("errorId"));
  const [selectedAuditLog, setSelectedAuditLog] = useState<AdminLogDetail | null>(null);
  const [selectedErrorLog, setSelectedErrorLog] = useState<AdminLogDetail | null>(null);
  const [auditDetailLoading, setAuditDetailLoading] = useState(false);
  const [errorDetailLoading, setErrorDetailLoading] = useState(false);
  const [auditDetailError, setAuditDetailError] = useState<string | null>(null);
  const [errorDetailError, setErrorDetailError] = useState<string | null>(null);
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
    email: string;
    password: string;
    role: AdminUser["role"];
    roles: AdminUser["roles"];
    gateId: string;
    groupsText: string;
    menuAccess: AppMenuKey[];
    permissions: UserPermissions;
  }>({
    username: "",
    displayName: "",
    email: "",
    password: "",
    role: "guard",
    roles: ["guard"],
    gateId: "",
    groupsText: "",
    menuAccess: getAllowedMenuAccessForRole("guard"),
    permissions: getDefaultPermissionsForRole("guard")
  });
  const [editableGates, setEditableGates] = useState<Record<string, AdminGate>>({});
  const [editableUsers, setEditableUsers] = useState<Record<string, EditableAdminUser>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userSaveState, setUserSaveState] = useState<{
    userId: string;
    kind: "saving" | "success" | "error";
    message: string;
  } | null>(null);
  const [editableFieldDefinitions, setEditableFieldDefinitions] = useState<Record<string, AdminFieldDefinition>>({});
  const [selectedFieldDefinitionId, setSelectedFieldDefinitionId] = useState<string | null>(null);
  const [selectedFieldSection, setSelectedFieldSection] = useState<string | null>(null);
  const [fieldImportText, setFieldImportText] = useState("");
  const [fieldImportFileName, setFieldImportFileName] = useState("");
  const [fieldImportPreview, setFieldImportPreview] = useState<{
    valid: boolean;
    summary: { total: number; willUpdate: number; willCreate: number; willSkip: number; warnings: string[] };
    changes: Array<{ fieldKey: string; action: "update" | "create"; label: string }>;
  } | null>(null);
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
  }, [errorLogFilters]);

  const describeLogDetailError = useCallback((apiError: unknown): string => {
    const payload = apiError as ApiError;
    if (payload?.error === "AUDIT_LOG_NOT_FOUND" || payload?.error === "ERROR_LOG_NOT_FOUND") {
      return "Log-Eintrag wurde nicht gefunden.";
    }
    if (payload?.error === "FORBIDDEN") {
      return "Sie besitzen keine Berechtigung, diesen Log-Eintrag anzuzeigen.";
    }
    const message = payload?.message || "Log-Details konnten nicht geladen werden.";
    return payload?.requestId ? `${message} Referenz: ${payload.requestId}` : message;
  }, []);

  useEffect(() => {
    const section = searchParams.get("section") as AdminSectionKey | null;
    if (section) setActiveSection(section);
    setSelectedAuditLogId(searchParams.get("auditId"));
    setSelectedErrorLogId(searchParams.get("errorId"));
  }, [searchParams]);

  useEffect(() => {
    if (!selectedAuditLogId) {
      setSelectedAuditLog(null);
      setAuditDetailError(null);
      setAuditDetailLoading(false);
      return;
    }
    const controller = new AbortController();
    setSelectedAuditLog(null);
    setAuditDetailError(null);
    setAuditDetailLoading(true);
    void fetchJson<{ log: AdminLogDetail }>(`/api/admin/audit-logs/${selectedAuditLogId}`, {
      method: "GET", headers: {}, signal: controller.signal
    }).then((payload) => {
      setSelectedAuditLog(payload.log);
    }).catch((apiError) => {
      if (!controller.signal.aborted) setAuditDetailError(describeLogDetailError(apiError));
    }).finally(() => {
      if (!controller.signal.aborted) setAuditDetailLoading(false);
    });
    return () => controller.abort();
  }, [describeLogDetailError, selectedAuditLogId]);

  useEffect(() => {
    if (!selectedErrorLogId) {
      setSelectedErrorLog(null);
      setErrorDetailError(null);
      setErrorDetailLoading(false);
      return;
    }
    const controller = new AbortController();
    setSelectedErrorLog(null);
    setErrorDetailError(null);
    setErrorDetailLoading(true);
    void fetchJson<{ log: AdminLogDetail }>(`/api/admin/error-logs/${selectedErrorLogId}`, {
      method: "GET", headers: {}, signal: controller.signal
    }).then((payload) => {
      setSelectedErrorLog(payload.log);
    }).catch((apiError) => {
      if (!controller.signal.aborted) setErrorDetailError(describeLogDetailError(apiError));
    }).finally(() => {
      if (!controller.signal.aborted) setErrorDetailLoading(false);
    });
    return () => controller.abort();
  }, [describeLogDetailError, selectedErrorLogId]);

  const selectAdminSection = useCallback((section: AdminSectionKey) => {
    setActiveSection(section);
    const next = new URLSearchParams(searchParams);
    next.set("section", section);
    if (section !== "audit") next.delete("auditId");
    if (section !== "fehler") next.delete("errorId");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const openAuditLog = useCallback((id: string) => {
    setSelectedAuditLogId(id);
    setSelectedErrorLogId(null);
    setActiveSection("audit");
    const next = new URLSearchParams(searchParams);
    next.set("section", "audit");
    next.set("auditId", id);
    next.delete("errorId");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closeAuditLog = useCallback(() => {
    setSelectedAuditLogId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("auditId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const openErrorLog = useCallback((id: string) => {
    setSelectedErrorLogId(id);
    setSelectedAuditLogId(null);
    setActiveSection("fehler");
    const next = new URLSearchParams(searchParams);
    next.set("section", "fehler");
    next.set("errorId", id);
    next.delete("auditId");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closeErrorLog = useCallback(() => {
    setSelectedErrorLogId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("errorId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [gatePayload, userPayload, textPayload, statusPayload, workflowPayload, backgroundPayload, siteMapPayload, siteMapsPayload, fieldDefinitionsPayload, retentionPayload, maintenancePayload] = await Promise.all([
        fetchJson<{ gates: AdminGate[] }>("/api/admin/gates", { method: "GET", headers: {} }),
        fetchJson<{ users: AdminUser[] }>("/api/admin/users", { method: "GET", headers: {} }),
        fetchJson<{ texts: AdminBadgeText[] }>("/api/texts", { method: "GET", headers: {} }),
        fetchJson<{ app: string; appVersion: string; schemaVersion: number; activeVisits: number; activeGates: number; openPreRegistrationsToday: number; signaturesPending: number; signaturesFollowUp: number; signaturesExceptions: number; dbHost?: string; dbName?: string }>("/api/admin/system-status", { method: "GET", headers: {} }),
        fetchJson<AdminWorkflowSettings>("/api/admin/system-settings/workflow-email", { method: "GET", headers: {} }),
        fetchJson<{ backgrounds: AdminUiBackground[] }>("/api/admin/ui-backgrounds", { method: "GET", headers: {} }),
        fetchJson<{ siteMap: AdminSiteMap | null }>("/api/admin/site-map", { method: "GET", headers: {} }),
        fetchJson<{ siteMaps: AdminSiteMap[] }>("/api/admin/site-maps", { method: "GET", headers: {} }),
        fetchJson<{ definitions: AdminFieldDefinition[] }>("/api/admin/field-definitions", { method: "GET", headers: {} }),
        fetchJson<AdminRetentionSettings>("/api/admin/data-retention", { method: "GET", headers: {} }),
        fetchJson<{ maintenanceMode: boolean }>("/api/admin/system-settings/maintenance", { method: "GET", headers: {} })
      ]);

      setGates(gatePayload.gates);
      setUsers(userPayload.users);
      setTexts(textPayload.texts);
      setSystemStatus(statusPayload);
      setWorkflowSettings(workflowPayload);
      setUiBackgrounds(backgroundPayload.backgrounds);
      setBackgroundMode(workflowPayload.backgroundMode);
      setBackgroundImageUrl(workflowPayload.backgroundImageUrl);
      setWorkflowPassword("");
      setActiveSiteMap(siteMapPayload.siteMap);
      setSiteMaps(siteMapsPayload.siteMaps);
      setFieldDefinitions(fieldDefinitionsPayload.definitions);
      setRetentionSettings(retentionPayload);
      setMaintenanceMode(maintenancePayload.maintenanceMode);
      setEditableGates(Object.fromEntries(gatePayload.gates.map((gate) => [gate.id, { ...gate }])));
      setEditableUsers(Object.fromEntries(userPayload.users.map((entry) => [entry.id, {
        ...entry,
        password: "",
        groupsText: formatGroupText(entry.groups),
        menuAccess: entry.menuAccess?.length ? entry.menuAccess : getAllowedMenuAccessForRole(entry.role),
        groups: entry.groups ?? [],
        permissions: entry.permissions ?? getDefaultPermissionsForRole(entry.role)
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
  }, [auditFilters, errorLogFilters, loadAuditLogs, loadErrorLogs, setBackgroundImageUrl, setBackgroundMode]);

  async function saveRetentionSettings() {
    if (!retentionSettings) return;
    const payload = await fetchJson<AdminRetentionSettings>("/api/admin/data-retention", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: retentionSettings.enabled, years: retentionSettings.years }) });
    setRetentionSettings(payload);
    setMessage("Datenlöschung gespeichert.");
  }

  async function runRetentionNow() {
    if (!window.confirm("Alte Vorgänge jetzt endgültig aus der Datenbank löschen?")) return;
    const payload = await fetchJson<{ visits: number; message: string }>("/api/admin/data-retention/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setMessage(payload.message);
    const refreshed = await fetchJson<AdminRetentionSettings>("/api/admin/data-retention", { method: "GET", headers: {} });
    setRetentionSettings(refreshed);
  }

  async function saveMaintenanceMode(value: boolean) {
    await fetchJson("/api/admin/system-settings/maintenance", { method: "PUT", body: JSON.stringify({ maintenanceMode: value }) });
    setMaintenanceMode(value);
    setMessage(value ? "Wartungsmodus aktiviert." : "Wartungsmodus deaktiviert.");
  }

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedFieldDefinitionId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setSelectedFieldDefinitionId(null);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedFieldDefinitionId]);

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
          email: newUser.email,
          password: newUser.password,
          role: newUser.role,
          roles: newUser.roles,
          gateId: null,
          groups: parseGroupText(newUser.groupsText),
          menuAccess: newUser.menuAccess,
          ...(newUser.role === "custom" ? { permissions: newUser.permissions } : {})
        })
      });
      setNewUser({
        username: "",
        displayName: "",
        email: "",
        password: "",
        role: "guard",
        roles: ["guard"],
        gateId: "",
        groupsText: "",
        menuAccess: getAllowedMenuAccessForRole("guard"),
        permissions: getDefaultPermissionsForRole("guard")
      });
      setMessage("Benutzer angelegt.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Benutzer konnte nicht angelegt werden.");
    }
  }

  async function importUsersCsv() {
    if (!userImportFile) {
      setError("Bitte zuerst eine CSV-Datei auswählen.");
      setUserImportIssues([]);
      return;
    }

    if (!/\.csv$/i.test(userImportFile.name)) {
      setUserImportSummary(null);
      setUserImportIssues([]);
      setError("Bitte eine CSV-Datei auswählen.");
      return;
    }

    if (userImportFile.size > 2 * 1024 * 1024) {
      setUserImportSummary(null);
      setUserImportIssues([]);
      setError("Die CSV-Datei ist größer als 2 MB.");
      return;
    }

    try {
      setUserImporting(true);
      const formData = new FormData();
      formData.append("file", userImportFile);
      const payload = await fetchJson<{ success: boolean; created: number; updated: number; total: number; message: string }>("/api/admin/users/import-csv", {
        method: "POST",
        body: formData
      });
      setUserImportIssues([]);
      setUserImportSummary({
        created: payload.created,
        updated: payload.updated,
        total: payload.total,
        fileName: userImportFile.name
      });
      setUserImportFile(null);
      setMessage(payload.message || "Benutzerimport erfolgreich abgeschlossen.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError & {
        details?: { errors?: Array<{ lineNumber: number; username: string | null; message: string }>; fieldErrors?: { file?: string[] } };
      };
      setUserImportSummary(null);
      setUserImportIssues(payload.details?.errors ?? []);
      setError(payload.details?.fieldErrors?.file?.[0] || payload.message || "Der Benutzerimport konnte nicht verarbeitet werden.");
    } finally {
      setUserImporting(false);
    }
  }

  function downloadUserImportTemplate() {
    window.location.assign("/api/admin/users/import-template.csv");
  }

  function downloadUserExport() {
    window.location.assign("/api/admin/users/export.csv");
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

  function isPermissionEnabled(permissions: UserPermissions, permission: AppPermission): boolean {
    const [section, key] = permission.split(".") as [keyof UserPermissions, string];
    return Boolean((permissions[section] as Record<string, boolean>)[key]);
  }

  function setPermissionValue(permissions: UserPermissions, permission: AppPermission, checked: boolean): UserPermissions {
    const [section, key] = permission.split(".") as [keyof UserPermissions, string];
    return {
      ...permissions,
      [section]: {
        ...(permissions[section] as Record<string, boolean>),
        [key]: checked
      }
    } as UserPermissions;
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

  function toggleNewUserPermission(permission: AppPermission, checked: boolean) {
    setNewUser((current) => ({
      ...current,
      permissions: setPermissionValue(current.permissions, permission, checked)
    }));
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
          roles: [role],
          gateId: null,
          menuAccess: nextMenuAccess.length ? nextMenuAccess : allowedAccess,
          permissions: getDefaultPermissionsForRole(role)
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
          groupsText: value
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

  function toggleEditableUserPermission(userId: string, permission: AppPermission, checked: boolean) {
    setEditableUsers((current) => {
      const currentEntry = current[userId];
      if (!currentEntry) {
        return current;
      }

      return {
        ...current,
        [userId]: {
          ...currentEntry,
          permissions: setPermissionValue(currentEntry.permissions, permission, checked)
        }
      };
    });
  }

  async function activateSiteMap(siteMapId: string) {
    try {
      await fetchJson(`/api/admin/site-maps/${siteMapId}/activate`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage("Geländeplan aktiviert.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Geländeplan konnte nicht aktiviert werden.");
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
    if (adminUser.roles.includes("sibe") && !adminUser.email?.trim()) {
      setUserSaveState({ userId, kind: "error", message: "Für SiBe ist eine E-Mail-Adresse erforderlich." });
      return;
    }
    setUserSaveState({ userId, kind: "saving", message: "Benutzer wird gespeichert..." });
    try {
      const payload = await fetchJson<{ success: true; user: AdminUser }>(`/api/admin/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({
          username: adminUser.username,
          displayName: adminUser.displayName,
          email: adminUser.email || "",
          role: adminUser.role,
          roles: adminUser.roles,
          gateId: null,
          isActive: adminUser.isActive,
          groups: parseGroupText(adminUser.groupsText),
          menuAccess: adminUser.menuAccess,
          ...(adminUser.role === "custom" ? { permissions: adminUser.permissions } : {}),
          ...(adminUser.password ? { password: adminUser.password } : {})
        })
      });
      const savedUser = payload.user;
      setUsers((current) => current.map((entry) => entry.id === userId ? savedUser : entry));
      setEditableUsers((current) => ({
        ...current,
        [userId]: {
          ...savedUser,
          password: "",
          groupsText: formatGroupText(savedUser.groups)
        }
      }));
      setMessage("Benutzer aktualisiert.");
      setError(null);
      setUserSaveState({ userId, kind: "success", message: "Benutzer wurde erfolgreich aktualisiert." });
    } catch (apiError) {
      const payload = apiError as ApiError;
      const saveError = payload.message || "Benutzer konnte nicht aktualisiert werden.";
      setError(saveError);
      setUserSaveState({ userId, kind: "error", message: saveError });
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
      setError("Bitte zuerst eine JSON-Datei für den Import auswählen.");
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
      setError("Bitte zuerst eine JSON-Datei für den Import auswählen.");
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

  async function deleteUser(userId: string) {
    if (!window.confirm("Benutzer wirklich dauerhaft löschen? Historisch referenzierte Konten werden pseudonymisiert.")) return;
    try {
      const payload = await fetchJson<{ message: string }>(`/api/admin/users/${userId}`, { method: "DELETE" });
      setMessage(payload.message);
      setSelectedUserId(null);
      await loadAll();
    } catch (apiError) {
      setError((apiError as ApiError).message || "Benutzer konnte nicht gelöscht werden.");
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

  async function saveWorkflowSettings() {
    if (!workflowSettings) {
      return;
    }

    try {
      const payload = await fetchJson<{ success: true; emailRelaySource: "database" | "yml" }>("/api/admin/system-settings/workflow-email", {
        method: "PUT",
        body: JSON.stringify({
          mailFormat: workflowSettings.mailFormat,
          backgroundMode: workflowSettings.backgroundMode,
          securityNumber: workflowSettings.securityNumber,
          emailRelay: {
            enabled: workflowSettings.emailRelay.enabled,
            host: workflowSettings.emailRelay.host,
            port: Number(workflowSettings.emailRelay.port),
            secure: workflowSettings.emailRelay.secure,
            username: workflowSettings.emailRelay.username,
            password: workflowPassword,
            fromAddress: workflowSettings.emailRelay.fromAddress
          }
        })
      });
      setWorkflowPassword("");
      setBackgroundMode(workflowSettings.backgroundMode);
      setMessage(
        payload.emailRelaySource === "yml"
          ? "Workflow gespeichert. Die SMTP-Relay-Daten kommen weiter aus der YML-Datei."
          : "Workflow- und Relay-Einstellungen gespeichert."
      );
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Die Workflow-Einstellungen konnten nicht gespeichert werden.");
    }
  }

  async function saveSecurityNumber() {
    if (!workflowSettings) return;

    try {
      const payload = await fetchJson<{ success: true; securityNumber: string }>("/api/admin/system-settings/security-number", {
        method: "PUT",
        body: JSON.stringify({ securityNumber: workflowSettings.securityNumber })
      });
      setWorkflowSettings((current) => current ? { ...current, securityNumber: payload.securityNumber } : current);
      setMessage("DATEV-Nummer gespeichert.");
      setError(null);
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Die DATEV-Nummer konnte nicht gespeichert werden.");
    }
  }

  async function saveUiBackgroundSettings() {
    if (!workflowSettings?.backgroundId) {
      setError("Bitte wählen Sie zuerst einen Hintergrund aus.");
      return;
    }

    setUiBackgroundSaving(true);
    try {
      const payload = await fetchJson<{
        backgroundId: string;
        backgroundMode: "image" | "subtle" | "plain";
        backgroundImageUrl: string;
        backgroundImageName: string;
        backgroundImageOriginalFileName: string;
      }>("/api/admin/ui-backgrounds/active", {
        method: "PUT",
        body: JSON.stringify({
          backgroundId: workflowSettings.backgroundId,
          backgroundMode: workflowSettings.backgroundMode
        })
      });

      setWorkflowSettings((current) => current ? {
        ...current,
        backgroundId: payload.backgroundId,
        backgroundMode: payload.backgroundMode,
        backgroundImageUrl: payload.backgroundImageUrl,
        backgroundImageName: payload.backgroundImageName,
        backgroundImageOriginalFileName: payload.backgroundImageOriginalFileName
      } : current);
      setUiBackgrounds((current) => current.map((background) => ({
        ...background,
        isActive: background.id === payload.backgroundId
      })));
      setBackgroundMode(payload.backgroundMode);
      setBackgroundImageUrl(payload.backgroundImageUrl);
      setMessage(`Hintergrund „${payload.backgroundImageName}“ gespeichert.`);
      setError(null);
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Der Hintergrund konnte nicht gespeichert werden.");
    } finally {
      setUiBackgroundSaving(false);
    }
  }

  async function sendWorkflowTestMail() {
    try {
      const payload = await fetchJson<{ message: string }>("/api/admin/system-settings/workflow-email/test", {
        method: "POST",
        body: JSON.stringify({
          recipient: workflowTestRecipient,
          kind: workflowTestKind
        })
      });
      setMessage(payload.message || "Testmail versendet.");
      setError(null);
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Die Testmail konnte nicht versendet werden.");
    }
  }

  const sectionTabs = [
    { key: "dashboard" as const, label: "Dashboard", visible: true },
    { key: "wachen" as const, label: "Wachen", visible: Boolean(currentUser && hasPermission(currentUser, "admin.guards")) },
    { key: "benutzer" as const, label: "Benutzer", visible: Boolean(currentUser && hasPermission(currentUser, "admin.users")) },
    { key: "texte" as const, label: "Texte", visible: Boolean(currentUser && hasPermission(currentUser, "texts.manage")) },
    { key: "karte" as const, label: "Geländeplan", visible: Boolean(currentUser && hasPermission(currentUser, "admin.map")) },
    { key: "hintergrund" as const, label: "Hintergrund", visible: Boolean(currentUser && hasPermission(currentUser, "admin.system")) },
    { key: "felder" as const, label: "Felder", visible: Boolean(currentUser && hasPermission(currentUser, "admin.fields")) },
    { key: "audit" as const, label: "Audit", visible: Boolean(currentUser && hasPermission(currentUser, "logs.audit")) },
    { key: "fehler" as const, label: "Fehlerlog", visible: Boolean(currentUser && hasPermission(currentUser, "logs.errors")) },
    { key: "system" as const, label: "System", visible: Boolean(currentUser && hasPermission(currentUser, "admin.system")) }
    ,{ key: "datenloeschung" as const, label: "Datenlöschung", visible: Boolean(currentUser && hasPermission(currentUser, "admin.system")) }
  ];

  const visibleSectionKeys = sectionTabs.filter((tab) => tab.visible).map((tab) => tab.key);
  const resolvedActiveSection = visibleSectionKeys.includes(activeSection) ? activeSection : visibleSectionKeys[0] ?? "dashboard";

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
        <div className="section-header">
          <div>
            <h2>Admin</h2>
          </div>
        </div>

        <div className="section-tabs">
          {sectionTabs.filter((tab) => tab.visible).map((tab) => (
            <button key={tab.key} type="button" className={resolvedActiveSection === tab.key ? "tab-button tab-active" : "tab-button"} onClick={() => selectAdminSection(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {message ? <Alert type="success">{message}</Alert> : null}
        {error ? <Alert type="error">{error}</Alert> : null}

        {resolvedActiveSection === "dashboard" ? (
          <AdminDashboardSection
            gates={gates}
            users={users}
            texts={texts}
            activeSiteMap={activeSiteMap}
            fieldDefinitions={fieldDefinitions}
            logs={logs}
            errorLogs={errorLogs}
            systemStatus={systemStatus}
            onOpenSection={selectAdminSection}
          />
        ) : null}

        {resolvedActiveSection === "wachen" ? (
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

        {resolvedActiveSection === "benutzer" ? (
          <AdminUsersSection
            newUser={newUser}
            setNewUser={setNewUser}
            gates={gates}
            menuOptions={menuOptions}
            permissionGroups={permissionGroups}
            createUser={createUser}
            users={users}
            editableUsers={editableUsers}
            setEditableUsers={setEditableUsers}
            selectedUserId={selectedUserId}
            setSelectedUserId={setSelectedUserId}
            updateEditableUserRole={updateEditableUserRole}
            updateEditableUserGroups={updateEditableUserGroups}
            formatGroupText={formatGroupText}
            isPermissionEnabled={isPermissionEnabled}
            toggleNewUserMenuAccess={toggleNewUserMenuAccess}
            toggleNewUserPermission={toggleNewUserPermission}
            toggleEditableUserMenuAccess={toggleEditableUserMenuAccess}
            toggleEditableUserPermission={toggleEditableUserPermission}
            userImportFile={userImportFile}
            setUserImportFile={setUserImportFile}
            userImporting={userImporting}
            userImportIssues={userImportIssues}
            userImportSummary={userImportSummary}
            downloadUserExport={downloadUserExport}
            downloadUserImportTemplate={downloadUserImportTemplate}
            importUsersCsv={importUsersCsv}
            saveUser={saveUser}
            userSaveState={userSaveState}
            toggleUserActive={toggleUserActive}
            deleteUser={deleteUser}
            currentUserId={currentUser?.id}
          />
        ) : null}

        {resolvedActiveSection === "karte" ? (
          <AdminSiteMapSection
            activeSiteMap={activeSiteMap}
            siteMaps={siteMaps}
            activateSiteMap={activateSiteMap}
          />
        ) : null}

        {resolvedActiveSection === "hintergrund" ? (
          <AdminBackgroundSection
            workflowSettings={workflowSettings}
            setWorkflowSettings={setWorkflowSettings}
            backgrounds={uiBackgrounds}
            saving={uiBackgroundSaving}
            saveBackgroundSettings={saveUiBackgroundSettings}
          />
        ) : null}

        {resolvedActiveSection === "texte" ? (
          <BadgeTextManager description="" />
        ) : null}

        {resolvedActiveSection === "felder" ? (
          <AdminFieldDefinitionsSection
            fieldDefinitions={fieldDefinitions}
            editableFieldDefinitions={editableFieldDefinitions}
            setEditableFieldDefinitions={setEditableFieldDefinitions}
            selectedFieldDefinitionId={selectedFieldDefinitionId}
            setSelectedFieldDefinitionId={setSelectedFieldDefinitionId}
            selectedFieldSection={selectedFieldSection}
            setSelectedFieldSection={setSelectedFieldSection}
            fieldImportText={fieldImportText}
            fieldImportFileName={fieldImportFileName}
            fieldImportPreview={fieldImportPreview}
            handleImportConfigFile={handleImportConfigFile}
            previewFieldImport={previewFieldImport}
            confirmFieldImport={confirmFieldImport}
            exportFieldConfiguration={exportFieldConfiguration}
            saveFieldDefinition={saveFieldDefinition}
            toggleFieldDefinitionActive={toggleFieldDefinitionActive}
          />
        ) : null}

        {resolvedActiveSection === "system" ? (
          <AdminSystemSection
            systemStatus={systemStatus}
            workflowSettings={workflowSettings}
            setWorkflowSettings={setWorkflowSettings}
            workflowPassword={workflowPassword}
            setWorkflowPassword={setWorkflowPassword}
            workflowTestRecipient={workflowTestRecipient}
            setWorkflowTestRecipient={setWorkflowTestRecipient}
            workflowTestKind={workflowTestKind}
            setWorkflowTestKind={setWorkflowTestKind}
            saveWorkflowSettings={saveWorkflowSettings}
            saveSecurityNumber={saveSecurityNumber}
            sendWorkflowTestMail={sendWorkflowTestMail}
            maintenanceMode={maintenanceMode}
            saveMaintenanceMode={saveMaintenanceMode}
          />
        ) : null}

        {resolvedActiveSection === "datenloeschung" ? <AdminDataRetentionSection settings={retentionSettings} setSettings={setRetentionSettings} save={saveRetentionSettings} runNow={runRetentionNow} /> : null}

        {resolvedActiveSection === "audit" ? (
          <AdminAuditSection
            auditFilters={auditFilters}
            setAuditFilters={setAuditFilters}
            applyAuditFilters={applyAuditFilters}
            resetAuditFilters={resetAuditFilters}
            logs={logs}
            selectedAuditLogId={selectedAuditLogId}
            selectedAuditLog={selectedAuditLog}
            detailLoading={auditDetailLoading}
            detailError={auditDetailError}
            openAuditLog={openAuditLog}
            closeAuditLog={closeAuditLog}
          />
        ) : null}

        {resolvedActiveSection === "fehler" ? (
          <AdminErrorLogSection
            errorLogFilters={errorLogFilters}
            setErrorLogFilters={setErrorLogFilters}
            applyErrorLogFilters={applyErrorLogFilters}
            resetErrorLogFilters={resetErrorLogFilters}
            errorLogs={errorLogs}
            selectedErrorLogId={selectedErrorLogId}
            selectedErrorLog={selectedErrorLog}
            detailLoading={errorDetailLoading}
            detailError={errorDetailError}
            openErrorLog={openErrorLog}
            closeErrorLog={closeErrorLog}
          />
        ) : null}
      </main>
    </AppLayout>
  );
}
