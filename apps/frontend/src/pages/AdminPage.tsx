import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent
} from "react";
import { Alert, Card, DataTable, FormField } from "../components/ui";
import {
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
  formatDateTime,
  formatFileSize,
  formatTextType,
  formatUserAgent,
  type FieldConfigExportPayload,
  type NewFieldDefinitionForm,
  type SiteMapSummary,
  useAuth
} from "../app/core";

export function AdminPage() {
  const { user: currentUser } = useAuth();
  const [activeSection, setActiveSection] = useState<"dashboard" | "wachen" | "benutzer" | "texte" | "karte" | "felder" | "audit" | "fehler" | "system">("dashboard");
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
  const [newUser, setNewUser] = useState({ username: "", displayName: "", password: "", role: "guard", gateId: "" });
  const [newText, setNewText] = useState<{
    name: string;
    textType: AdminBadgeText["textType"];
    content: string;
    isActive: boolean;
  }>({ name: "", textType: "security_notice", content: "", isActive: true });
  const [siteMapName, setSiteMapName] = useState("");
  const [siteMapFile, setSiteMapFile] = useState<File | null>(null);
  const [siteMapPreviewUrl, setSiteMapPreviewUrl] = useState<string | null>(null);
  const [siteMapFieldError, setSiteMapFieldError] = useState<string | null>(null);
  const [siteMapUploading, setSiteMapUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [editableGates, setEditableGates] = useState<Record<string, AdminGate>>({});
  const [editableUsers, setEditableUsers] = useState<Record<string, EditableAdminUser>>({});
  const [editableTexts, setEditableTexts] = useState<Record<string, AdminBadgeText>>({});
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
      setEditableUsers(Object.fromEntries(userPayload.users.map((entry) => [entry.id, { ...entry, password: "" }])));
      setEditableTexts(Object.fromEntries(textPayload.texts.map((text) => [text.id, { ...text }])));
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
          gateId: newUser.role === "guard" ? newUser.gateId || null : null
        })
      });
      setNewUser({ username: "", displayName: "", password: "", role: "guard", gateId: "" });
      setMessage("Benutzer angelegt.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Benutzer konnte nicht angelegt werden.");
    }
  }

  async function createText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await fetchJson("/api/admin/badge-texts", {
        method: "POST",
        body: JSON.stringify(newText)
      });
      setNewText({ name: "", textType: "security_notice", content: "", isActive: true });
      setMessage("Hinweistext angelegt.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Hinweistext konnte nicht angelegt werden.");
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

  async function saveText(text: AdminBadgeText) {
    try {
      await fetchJson(`/api/admin/badge-texts/${text.id}`, {
        method: "PUT",
        body: JSON.stringify(text)
      });
      setMessage("Hinweistext gespeichert.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Hinweistext konnte nicht gespeichert werden.");
    }
  }

  async function toggleTextActive(textId: string, active: boolean) {
    try {
      await fetchJson(`/api/admin/badge-texts/${textId}/${active ? "reactivate" : "deactivate"}`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage(active ? "Hinweistext reaktiviert." : "Hinweistext deaktiviert.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Hinweistext konnte nicht aktualisiert werden.");
    }
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
          gateId: adminUser.role === "guard" ? adminUser.gateId : null,
          isActive: adminUser.isActive,
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
  const hiddenFieldKeys = new Set(["visitor_address"]);
  const fieldSectionDescriptions: Record<string, string> = {
    Besucher: "Daten zur besuchenden Person.",
    Adresse: "Strukturierte Adressdaten fuer Check-in und Druck.",
    Ansprechpartner: "Kontakt zur empfangenden Person im Unternehmen.",
    Besuch: "Besuchszweck, Gueltigkeitszeitraum und Ablaufdaten.",
    Ausweis: "Ausweisdaten fuer den Wache-Prozess.",
    "Ziel/Raum": "Interne Ziel-, Gebaeude- und Raumangaben.",
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
            <p className="section-copy">Dashboard und getrennte Verwaltungsbereiche fuer den laufenden Betrieb.</p>
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
          <div className="card-grid stat-grid admin-dashboard-grid">
            <article className="panel mini-card"><h3>Wachen</h3><p>{gates.filter((gate) => gate.isActive).length} aktive Wachen</p><button type="button" className="secondary-button" onClick={() => setActiveSection("wachen")}>Oeffnen</button></article>
            <article className="panel mini-card"><h3>Benutzer</h3><p>{users.filter((entry) => entry.isActive).length} aktive Benutzer</p><button type="button" className="secondary-button" onClick={() => setActiveSection("benutzer")}>Oeffnen</button></article>
            <article className="panel mini-card"><h3>Hinweistexte</h3><p>{texts.filter((text) => text.isActive).length} aktive Texte</p><button type="button" className="secondary-button" onClick={() => setActiveSection("texte")}>Oeffnen</button></article>
            <article className="panel mini-card"><h3>Gelaendeplan</h3><p>{activeSiteMap ? activeSiteMap.name : "Kein aktiver Plan"}</p><button type="button" className="secondary-button" onClick={() => setActiveSection("karte")}>Oeffnen</button></article>
            <article className="panel mini-card"><h3>Feldkonfiguration</h3><p>{fieldDefinitions.filter((field) => field.isActive).length} aktive Felder</p><button type="button" className="secondary-button" onClick={() => setActiveSection("felder")}>Oeffnen</button></article>
            <article className="panel mini-card"><h3>Auditlog</h3><p>{logs.length} letzte Eintraege</p><button type="button" className="secondary-button" onClick={() => setActiveSection("audit")}>Oeffnen</button></article>
            <article className="panel mini-card"><h3>Fehlerlog</h3><p>{errorLogs.length} letzte Eintraege</p><button type="button" className="secondary-button" onClick={() => setActiveSection("fehler")}>Oeffnen</button></article>
            <article className="panel mini-card"><h3>Systemstatus</h3><p>{systemStatus ? `${systemStatus.activeVisits} aktiv, ${systemStatus.signaturesFollowUp} Nachreichungen` : "Lade..."}</p><button type="button" className="secondary-button" onClick={() => setActiveSection("system")}>Oeffnen</button></article>
          </div>
        ) : null}

        {activeSection === "wachen" ? <Card>
          <h3>Wachen</h3>
          <form className="form-grid two-columns" onSubmit={createGate}>
            <input placeholder="Name" value={newGate.name} onChange={(event) => setNewGate((c) => ({ ...c, name: event.target.value }))} />
            <input placeholder="Standort" value={newGate.location} onChange={(event) => setNewGate((c) => ({ ...c, location: event.target.value }))} />
            <input placeholder="Beschreibung" value={newGate.description} onChange={(event) => setNewGate((c) => ({ ...c, description: event.target.value }))} />
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
        </Card> : null}

        {activeSection === "benutzer" ? <Card>
          <h3>Benutzer</h3>
          <form className="form-grid two-columns" onSubmit={createUser}>
            <input placeholder="Benutzername" value={newUser.username} onChange={(event) => setNewUser((c) => ({ ...c, username: event.target.value }))} />
            <input placeholder="Anzeigename" value={newUser.displayName} onChange={(event) => setNewUser((c) => ({ ...c, displayName: event.target.value }))} />
            <input type="password" placeholder="Passwort (min. 8)" value={newUser.password} onChange={(event) => setNewUser((c) => ({ ...c, password: event.target.value }))} />
            <select value={newUser.role} onChange={(event) => setNewUser((c) => ({ ...c, role: event.target.value, gateId: event.target.value === "guard" ? c.gateId : "" }))}>
              <option value="guard">guard</option>
              <option value="admin">admin</option>
              <option value="sibe">sibe</option>
            </select>
            <select value={newUser.gateId} onChange={(event) => setNewUser((c) => ({ ...c, gateId: event.target.value }))} disabled={newUser.role !== "guard"}>
              <option value="">Wache waehlen</option>
              {gates.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}
            </select>
            <button type="submit">Benutzer speichern</button>
          </form>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Username</th><th>Anzeigename</th><th>Rolle</th><th>Wache</th><th>Passwort</th><th>Status</th><th>Aktion</th></tr></thead>
              <tbody>
                {users.map((entry) => (
                  <tr key={entry.id}>
                    <td><input value={editableUsers[entry.id]?.username || ""} onChange={(event) => setEditableUsers((current) => ({ ...current, [entry.id]: { ...(current[entry.id] || entry), username: event.target.value } }))} /></td>
                    <td><input value={editableUsers[entry.id]?.displayName || ""} onChange={(event) => setEditableUsers((current) => ({ ...current, [entry.id]: { ...(current[entry.id] || entry), displayName: event.target.value } }))} /></td>
                    <td>
                      <select value={editableUsers[entry.id]?.role || entry.role} onChange={(event) => setEditableUsers((current) => {
                        const role = event.target.value as AdminUser["role"];
                        const currentEntry = current[entry.id] || entry;
                        return { ...current, [entry.id]: { ...currentEntry, role, gateId: role === "guard" ? currentEntry.gateId : null } };
                      })}>
                        <option value="guard">guard</option>
                        <option value="admin">admin</option>
                        <option value="sibe">sibe</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={editableUsers[entry.id]?.gateId || ""}
                        onChange={(event) => setEditableUsers((current) => ({ ...current, [entry.id]: { ...(current[entry.id] || entry), gateId: event.target.value || null } }))}
                        disabled={(editableUsers[entry.id]?.role || entry.role) !== "guard"}
                      >
                        <option value="">-</option>
                        {gates.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}
                      </select>
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
                        <button className="danger-button" type="button" onClick={() => void deleteUser(entry)} disabled={currentUser?.id === entry.id}>Loeschen</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card> : null}

        {activeSection === "karte" ? (
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
        ) : null}

        {activeSection === "texte" ? (
          <Card>
            <h3>Hinweistexte</h3>
            <form className="form-grid two-columns" onSubmit={createText}>
              <FormField label="Name" required>
                <input value={newText.name} onChange={(event) => setNewText((current) => ({ ...current, name: event.target.value }))} />
              </FormField>
              <FormField label="Typ" required>
                <select value={newText.textType} onChange={(event) => setNewText((current) => ({ ...current, textType: event.target.value as AdminBadgeText["textType"] }))}>
                  <option value="security_notice">security_notice</option>
                  <option value="photo_ban">photo_ban</option>
                  <option value="signature_notice">signature_notice</option>
                  <option value="footer">footer</option>
                </select>
              </FormField>
              <label className="checkbox-row">
                <input type="checkbox" checked={newText.isActive} onChange={(event) => setNewText((current) => ({ ...current, isActive: event.target.checked }))} />
                Aktiv
              </label>
              <div />
              <FormField label="Inhalt" required>
                <textarea rows={3} value={newText.content} onChange={(event) => setNewText((current) => ({ ...current, content: event.target.value }))} />
              </FormField>
              <div className="row-actions">
                <button type="submit">Hinweistext anlegen</button>
              </div>
            </form>
            <DataTable>
              <thead><tr><th>Name</th><th>Typ</th><th>Aktiv</th><th>Inhalt</th><th>Aktion</th></tr></thead>
              <tbody>
                {texts.map((text) => (
                  <tr key={text.id}>
                    <td><input value={editableTexts[text.id]?.name || ""} onChange={(event) => setEditableTexts((current) => ({ ...current, [text.id]: { ...(current[text.id] || text), name: event.target.value } }))} /></td>
                    <td>
                      <select value={editableTexts[text.id]?.textType || text.textType} onChange={(event) => setEditableTexts((current) => ({ ...current, [text.id]: { ...(current[text.id] || text), textType: event.target.value as AdminBadgeText["textType"] } }))}>
                        <option value="security_notice">{formatTextType("security_notice")}</option>
                        <option value="photo_ban">{formatTextType("photo_ban")}</option>
                        <option value="signature_notice">{formatTextType("signature_notice")}</option>
                        <option value="footer">{formatTextType("footer")}</option>
                      </select>
                    </td>
                    <td>
                      <label className="checkbox-row">
                        <input type="checkbox" checked={editableTexts[text.id]?.isActive ?? text.isActive} onChange={(event) => setEditableTexts((current) => ({ ...current, [text.id]: { ...(current[text.id] || text), isActive: event.target.checked } }))} />
                        {editableTexts[text.id]?.isActive ?? text.isActive ? "Aktiv" : "Inaktiv"}
                      </label>
                    </td>
                    <td><textarea value={editableTexts[text.id]?.content || ""} onChange={(event) => setEditableTexts((current) => ({ ...current, [text.id]: { ...(current[text.id] || text), content: event.target.value } }))} /></td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => void saveText(editableTexts[text.id] || text)}>Speichern</button>
                        <button className="danger-button" type="button" onClick={() => void toggleTextActive(text.id, text.isActive)}>{text.isActive ? "Deaktivieren" : "Reaktivieren"}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
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
        ) : null}

        {activeSection === "audit" ? (
          <Card>
            <h3>Auditlog</h3>
            <div className="toolbar audit-toolbar">
              <input
                placeholder="Suche nach Benutzer, Aktion oder Objekt"
                value={auditFilters.search}
                onChange={(event) => setAuditFilters((current) => ({ ...current, search: event.target.value }))}
              />
              <input
                placeholder="Aktion"
                value={auditFilters.action}
                onChange={(event) => setAuditFilters((current) => ({ ...current, action: event.target.value }))}
              />
              <input
                placeholder="Benutzer"
                value={auditFilters.user}
                onChange={(event) => setAuditFilters((current) => ({ ...current, user: event.target.value }))}
              />
              <input
                placeholder="IP"
                value={auditFilters.ip}
                onChange={(event) => setAuditFilters((current) => ({ ...current, ip: event.target.value }))}
              />
              <input
                type="datetime-local"
                value={auditFilters.from}
                onChange={(event) => setAuditFilters((current) => ({ ...current, from: event.target.value }))}
              />
              <input
                type="datetime-local"
                value={auditFilters.to}
                onChange={(event) => setAuditFilters((current) => ({ ...current, to: event.target.value }))}
              />
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
        ) : null}

        {activeSection === "fehler" ? (
          <Card>
            <h3>Fehlerlog</h3>
            <div className="toolbar audit-toolbar">
              <input
                placeholder="Suche nach Meldung, Benutzer oder Pfad"
                value={errorLogFilters.search}
                onChange={(event) => setErrorLogFilters((current) => ({ ...current, search: event.target.value }))}
              />
              <input
                placeholder="Fehlercode"
                value={errorLogFilters.errorCode}
                onChange={(event) => setErrorLogFilters((current) => ({ ...current, errorCode: event.target.value }))}
              />
              <input
                placeholder="Pfad"
                value={errorLogFilters.path}
                onChange={(event) => setErrorLogFilters((current) => ({ ...current, path: event.target.value }))}
              />
              <input
                type="datetime-local"
                value={errorLogFilters.from}
                onChange={(event) => setErrorLogFilters((current) => ({ ...current, from: event.target.value }))}
              />
              <input
                type="datetime-local"
                value={errorLogFilters.to}
                onChange={(event) => setErrorLogFilters((current) => ({ ...current, to: event.target.value }))}
              />
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
        ) : null}
      </main>
    </AppLayout>
  );
}
