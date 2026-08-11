import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AppLayout,
  type ApiError,
  buildInitialCheckoutState,
  fetchJson,
  extractFieldErrors,
  formatDateOnly,
  formatDateTime,
  formatSignatureStatus,
  formatStatus,
  statusClassName,
  toDateInputValue,
  useAuth,
  type CheckoutFormState,
  type Gate,
  type GuardCalendarItem,
  type VisitRow
} from "../app/core";
import { Alert, FormField } from "../components/ui";
import { CountrySelect } from "../components/CountrySelect";

type WalkInAction = "save" | "check_in" | "check_in_and_print";

type WalkInFormState = {
  clientRequestId: string;
  existingVisitorId: string | null;
  gateId: string;
  firstName: string;
  lastName: string;
  company: string;
  nationalityCode: string;
  birthDate: string;
  phone: string;
  email: string;
  licensePlate: string;
  hostName: string;
  hostEmail: string;
  hostPhone: string;
  hostDepartment: string;
  purpose: string;
  validFrom: string;
  validUntil: string;
  notes: string;
  visitorStreet: string;
  visitorHouseNumber: string;
  visitorPostalCode: string;
  visitorCity: string;
  idDocumentType: "identity_card" | "passport" | "service_id" | "other";
  idDocumentValidUntil: string;
  idDocumentNumber: string;
  devicePhotoApp: boolean;
  deviceFilmApp: boolean;
  deviceVideoCamera: boolean;
  deviceManufacturer: string;
  deviceSerialNumber: string;
  deviceAccessories: string;
  deviceDepositNote: string;
};

type VisitorSearchFormState = {
  query: string;
};

type GuardVisitorHistoryItem = {
  visitId: string;
  validFrom: string;
  validUntil: string;
  hostName: string;
  hostDepartment: string | null;
  purpose: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string;
  gateName: string | null;
};

type GuardVisitorMatch = {
  visitorId: string;
  firstName: string;
  lastName: string;
  company: string;
  nationalityCode: string | null;
  nationalityName: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  visitorStreet: string | null;
  visitorHouseNumber: string | null;
  visitorPostalCode: string | null;
  visitorCity: string | null;
  idDocumentType: WalkInFormState["idDocumentType"] | null;
  idDocumentValidUntil: string | null;
  idDocumentNumber: string | null;
  lastLicensePlate: string | null;
  visitCount: number;
  lastVisitAt: string | null;
  lastVisitStatus: string | null;
  lastHostName: string | null;
  lastHostDepartment: string | null;
  lastPurpose: string | null;
  devicePhotoApp: boolean | null;
  deviceFilmApp: boolean | null;
  deviceVideoCamera: boolean | null;
  deviceManufacturer: string | null;
  deviceSerialNumber: string | null;
  deviceAccessories: string | null;
  deviceDepositNote: string | null;
  history: GuardVisitorHistoryItem[];
};

type RecentWalkInResult = {
  visitId: string;
  badgeNumber: string;
  status: string;
};

function buildWalkInRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function buildInitialWalkInForm(): WalkInFormState {
  const today = toDateInputValue(new Date());
  return {
    clientRequestId: buildWalkInRequestId(),
    existingVisitorId: null,
    gateId: "",
    firstName: "",
    lastName: "",
    company: "",
    nationalityCode: "DE",
    birthDate: "",
    phone: "",
    email: "",
    licensePlate: "",
    hostName: "",
    hostEmail: "",
    hostPhone: "",
    hostDepartment: "",
    purpose: "",
    validFrom: today,
    validUntil: today,
    notes: "",
    visitorStreet: "",
    visitorHouseNumber: "",
    visitorPostalCode: "",
    visitorCity: "",
    idDocumentType: "identity_card",
    idDocumentValidUntil: today,
    idDocumentNumber: "",
    devicePhotoApp: false,
    deviceFilmApp: false,
    deviceVideoCamera: false,
    deviceManufacturer: "",
    deviceSerialNumber: "",
    deviceAccessories: "",
    deviceDepositNote: ""
  };
}

function buildInitialVisitorSearchForm(): VisitorSearchFormState {
  return {
    query: ""
  };
}

function hasSearchCriteria(search: VisitorSearchFormState): boolean {
  return search.query.trim().length >= 2;
}

function isPastDate(value: string): boolean {
  if (!value) return false;
  const date = new Date(`${value}T23:59:59.999Z`);
  return !Number.isNaN(date.getTime()) && date < new Date();
}

function applyVisitorToWalkInForm(current: WalkInFormState, visitor: GuardVisitorMatch): WalkInFormState {
  return {
    ...current,
    existingVisitorId: visitor.visitorId,
    firstName: visitor.firstName,
    lastName: visitor.lastName,
    company: visitor.company,
    nationalityCode: visitor.nationalityCode || current.nationalityCode,
    birthDate: visitor.birthDate || "",
    phone: visitor.phone || "",
    email: visitor.email || "",
    licensePlate: visitor.lastLicensePlate || "",
    visitorStreet: visitor.visitorStreet || "",
    visitorHouseNumber: visitor.visitorHouseNumber || "",
    visitorPostalCode: visitor.visitorPostalCode || "",
    visitorCity: visitor.visitorCity || "",
    idDocumentType: (visitor.idDocumentType as WalkInFormState["idDocumentType"] | null) || current.idDocumentType,
    idDocumentValidUntil: visitor.idDocumentValidUntil || current.idDocumentValidUntil,
    idDocumentNumber: visitor.idDocumentNumber || "",
    devicePhotoApp: Boolean(visitor.devicePhotoApp),
    deviceFilmApp: Boolean(visitor.deviceFilmApp),
    deviceVideoCamera: Boolean(visitor.deviceVideoCamera),
    deviceManufacturer: visitor.deviceManufacturer || "",
    deviceSerialNumber: visitor.deviceSerialNumber || "",
    deviceAccessories: visitor.deviceAccessories || "",
    deviceDepositNote: visitor.deviceDepositNote || ""
  };
}

export function GuardDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGuardUser = user?.role === "guard";
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [calendarItems, setCalendarItems] = useState<GuardCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [visitScope, setVisitScope] = useState<"own" | "all">("own");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<"list" | "calendar">("list");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [checkoutState, setCheckoutState] = useState<Record<string, CheckoutFormState>>({});
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInSaving, setWalkInSaving] = useState(false);
  const [walkInError, setWalkInError] = useState<string | null>(null);
  const [walkInFieldErrors, setWalkInFieldErrors] = useState<Record<string, string>>({});
  const [walkInGates, setWalkInGates] = useState<Gate[]>([]);
  const [walkInForm, setWalkInForm] = useState<WalkInFormState>(() => buildInitialWalkInForm());
  const [visitorSearchForm, setVisitorSearchForm] = useState<VisitorSearchFormState>(() => buildInitialVisitorSearchForm());
  const [visitorSearchLoading, setVisitorSearchLoading] = useState(false);
  const [visitorSearchResults, setVisitorSearchResults] = useState<GuardVisitorMatch[]>([]);
  const [walkInSearchOpen, setWalkInSearchOpen] = useState(true);
  const [selectedVisitor, setSelectedVisitor] = useState<GuardVisitorMatch | null>(null);
  const [possibleDuplicates, setPossibleDuplicates] = useState<GuardVisitorMatch[]>([]);
  const [recentWalkInResult, setRecentWalkInResult] = useState<RecentWalkInResult | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  function toDayKey(date: Date): string {
    return toDateInputValue(date);
  }

  function monthRange(monthStart: Date) {
    const firstVisible = new Date(monthStart);
    firstVisible.setDate(1);
    const startOffset = (firstVisible.getDay() + 6) % 7;
    firstVisible.setDate(firstVisible.getDate() - startOffset);

    const lastVisible = new Date(firstVisible);
    lastVisible.setDate(lastVisible.getDate() + 41);
    return { from: firstVisible, to: lastVisible };
  }

  const monthDays = useMemo(() => {
    const range = monthRange(calendarMonth);
    const days: Date[] = [];
    const cursor = new Date(range.from);
    while (cursor <= range.to) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [calendarMonth]);

  const calendarItemsByDay = useMemo(() => {
    const map = new Map<string, GuardCalendarItem[]>();
    for (const item of calendarItems) {
      const start = new Date(item.validFrom);
      const end = new Date(item.validUntil);
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cursor <= last) {
        const key = toDayKey(cursor);
        const list = map.get(key) ?? [];
        list.push(item);
        map.set(key, list);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return map;
  }, [calendarItems]);

  const selectedDayItems = useMemo(() => {
    const key = toDayKey(selectedDay);
    const items = calendarItemsByDay.get(key) ?? [];
    return [...items].sort((left, right) => left.validFrom.localeCompare(right.validFrom));
  }, [calendarItemsByDay, selectedDay]);

  const todayKey = toDayKey(new Date());
  const selectedDayKey = toDayKey(selectedDay);
  useEffect(() => {
    setWalkInForm((current) => ({ ...current, gateId: current.gateId || user?.gateId || "" }));
    if (isGuardUser) return;

    void fetchJson<{ gates: Gate[] }>("/api/public/gates", { method: "GET", headers: {} })
      .then((payload) => setWalkInGates(payload.gates))
      .catch(() => setWalkInGates([]));
  }, [isGuardUser, user?.gateId]);

  const stats = useMemo(() => {
    const preRegistered = visits.filter((visit) => visit.status === "pre_registered").length;
    const checkedIn = visits.filter((visit) => visit.status === "checked_in").length;
    const checkedOut = visits.filter((visit) => visit.status === "checked_out").length;
    return { preRegistered, checkedIn, checkedOut };
  }, [visits]);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      params.set("scope", isGuardUser ? visitScope : "all");

      if (search) {
        params.set("search", search);
      }

      const payload = await fetchJson<{ visits: VisitRow[] }>(`/api/guard/visits/today?${params.toString()}`, {
        method: "GET",
        headers: {}
      });
      setVisits(payload.visits);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Die Tagesübersicht konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [isGuardUser, search, statusFilter, visitScope]);

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const range = monthRange(calendarMonth);
      const params = new URLSearchParams();
      params.set("from", toDateInputValue(range.from));
      params.set("to", toDateInputValue(range.to));
      params.set("status", statusFilter);
      params.set("scope", isGuardUser ? visitScope : "all");
      if (search) {
        params.set("search", search);
      }
      const payload = await fetchJson<{ items: GuardCalendarItem[] }>(`/api/guard/visits/calendar?${params.toString()}`, {
        method: "GET",
        headers: {}
      });
      setCalendarItems(payload.items);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Die Kalenderansicht konnte nicht geladen werden.");
    } finally {
      setCalendarLoading(false);
    }
  }, [calendarMonth, isGuardUser, search, statusFilter, visitScope]);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    if (walkInOpen) return;

    const refreshDashboard = () => {
      if (document.visibilityState === "visible") {
        void Promise.all([loadVisits(), loadCalendar()]);
      }
    };
    const interval = window.setInterval(refreshDashboard, 60_000);
    document.addEventListener("visibilitychange", refreshDashboard);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshDashboard);
    };
  }, [loadCalendar, loadVisits, walkInOpen]);

  useEffect(() => {
    if (!walkInOpen || !hasSearchCriteria(visitorSearchForm)) {
      setVisitorSearchResults([]);
      setVisitorSearchLoading(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(visitorSearchForm)) {
        if (value.trim()) {
          params.set(key, value.trim());
        }
      }
      params.set("limit", "8");

      setVisitorSearchLoading(true);
      void fetchJson<{ visitors: GuardVisitorMatch[] }>(`/api/guard/visitors/search?${params.toString()}`, {
        method: "GET",
        headers: {}
      }).then((payload) => {
        setVisitorSearchResults(payload.visitors);
      }).catch(() => {
        setVisitorSearchResults([]);
      }).finally(() => {
        setVisitorSearchLoading(false);
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [visitorSearchForm, walkInOpen]);

  useEffect(() => {
    if (!walkInOpen || selectedVisitor) {
      setPossibleDuplicates([]);
      return;
    }

    const duplicateSearch = {
      firstName: walkInForm.firstName,
      lastName: walkInForm.lastName,
      birthDate: walkInForm.birthDate,
      city: walkInForm.visitorCity,
      email: walkInForm.email,
      phone: walkInForm.phone
    };

    const hasDuplicateCriteria = Object.entries(duplicateSearch).some(([key, value]) =>
      key === "birthDate" ? value.trim().length === 10 : value.trim().length >= 2
    );

    if (!hasDuplicateCriteria) {
      setPossibleDuplicates([]);
      return;
    }

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(duplicateSearch)) {
        if (value.trim()) {
          params.set(key, value.trim());
        }
      }
      params.set("limit", "5");
      void fetchJson<{ visitors: GuardVisitorMatch[] }>(`/api/guard/visitors/search?${params.toString()}`, {
        method: "GET",
        headers: {}
      }).then((payload) => {
        setPossibleDuplicates(payload.visitors);
      }).catch(() => {
        setPossibleDuplicates([]);
      });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [
    selectedVisitor,
    walkInForm.birthDate,
    walkInForm.email,
    walkInForm.firstName,
    walkInForm.lastName,
    walkInForm.phone,
    walkInForm.visitorCity,
    walkInOpen
  ]);

  async function handleCheckIn(visitId: string) {
    setActionMessage(null);

    try {
      await fetchJson<{ success: boolean }>("/api/guard/visits/" + visitId + "/check-in", {
        method: "POST",
        body: JSON.stringify({})
      });
      setActionMessage("Besuch wurde eingecheckt.");
      await loadVisits();
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      if (errorPayload.error === "VALIDATION_ERROR") {
        navigate(`/wache/besuche/${visitId}`);
        return;
      }
      setActionMessage(errorPayload.message || "Check-in fehlgeschlagen.");
    }
  }

  async function handleCheckOut(visitId: string) {
    const current = checkoutState[visitId] ?? buildInitialCheckoutState();

    try {
      await fetchJson<{ success: boolean }>("/api/guard/visits/" + visitId + "/check-out", {
        method: "POST",
        body: JSON.stringify({
          returned_badge_number: current.returnedVisitNumber,
          signed_by_host_confirmed: current.signedByHostConfirmed
        })
      });
      setActionMessage("Besuch wurde ausgecheckt.");
      setCheckoutState((existing) => ({ ...existing, [visitId]: buildInitialCheckoutState() }));
      await loadVisits();
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setActionMessage(errorPayload.message || "Check-out fehlgeschlagen.");
    }
  }

  async function handleWalkInCreate(action: WalkInAction) {
    if (walkInSaving) return;

    // Das Fenster muss noch innerhalb des Klick-Ereignisses geöffnet werden,
    // sonst wird es nach der asynchronen Speicherung von Popup-Blockern verworfen.
    const printWindow = action === "check_in_and_print" ? window.open("", "_blank") : null;
    setActionMessage(null);
    setWalkInError(null);
    setWalkInFieldErrors({});
    setWalkInSaving(true);

    try {
      const payload = await fetchJson<{ message: string; badgeNumber: string; visitId: string; status: string; warnings: string[] }>("/api/guard/visits/walk-in", {
        method: "POST",
        body: JSON.stringify({
          ...walkInForm,
          action
        })
      });
      setWalkInOpen(false);
      setWalkInForm(buildInitialWalkInForm());
      setWalkInError(null);
      setWalkInFieldErrors({});
      setVisitorSearchForm(buildInitialVisitorSearchForm());
      setVisitorSearchResults([]);
      setSelectedVisitor(null);
      setPossibleDuplicates([]);
      setRecentWalkInResult({
        visitId: payload.visitId,
        badgeNumber: payload.badgeNumber,
        status: payload.status
      });
      if (action === "check_in_and_print") {
        if (printWindow) {
          printWindow.opener = null;
          printWindow.location.replace(`/wache/besuche/${payload.visitId}/druck?autoprint=1`);
        }
        const warningText = payload.warnings.length ? ` Warnung: ${payload.warnings.join(" ")}` : "";
        setActionMessage(printWindow
          ? `${payload.message} Besuchsnummer: ${payload.badgeNumber}. Druckansicht wurde geöffnet.${warningText}`
          : `${payload.message} Besuchsnummer: ${payload.badgeNumber}. Das Druckfenster konnte nicht automatisch geöffnet werden.${warningText}`);
      } else {
        const warningText = payload.warnings.length ? ` Warnung: ${payload.warnings.join(" ")}` : "";
        setActionMessage(`${payload.message} Besuchsnummer: ${payload.badgeNumber}.${warningText}`);
      }
      await Promise.all([loadVisits(), loadCalendar()]);
    } catch (apiError) {
      printWindow?.close();
      const errorPayload = apiError as ApiError;
      const message = errorPayload.message || "Spontanbesucher konnte nicht angelegt werden.";
      setWalkInError(message);
      setWalkInFieldErrors(extractFieldErrors(errorPayload));
      setActionMessage(message);
    } finally {
      setWalkInSaving(false);
    }
  }

  function selectExistingVisitor(visitor: GuardVisitorMatch) {
    setSelectedVisitor(visitor);
    setWalkInForm((current) => applyVisitorToWalkInForm(current, visitor));
    setVisitorSearchForm(buildInitialVisitorSearchForm());
    setVisitorSearchResults([]);
    setPossibleDuplicates([]);
    setWalkInSearchOpen(false);
  }

  function resetWalkInDialog() {
    setWalkInOpen(false);
    setWalkInForm(buildInitialWalkInForm());
    setWalkInError(null);
    setWalkInFieldErrors({});
    setVisitorSearchForm(buildInitialVisitorSearchForm());
    setVisitorSearchResults([]);
    setWalkInSearchOpen(true);
    setSelectedVisitor(null);
    setPossibleDuplicates([]);
  }

  function updateCheckoutState(visitId: string, next: Partial<CheckoutFormState>) {
    setCheckoutState((existing) => ({
      ...existing,
      [visitId]: {
        ...(existing[visitId] ?? buildInitialCheckoutState()),
        ...next
      }
    }));
  }

  const hasActiveFilters = statusFilter !== "all" || visitScope !== "own" || search.trim().length > 0 || searchInput.trim().length > 0;

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide guard-page">
        <div className="section-header">
          <div>
            <h2>Wache</h2>
          </div>
          <div className="section-tabs">
            <button type="button" className="secondary-button" onClick={() => {
              setWalkInError(null);
              setWalkInFieldErrors({});
              setWalkInSearchOpen(true);
              setWalkInOpen(true);
            }}>
              Spontanbesucher anmelden
            </button>
            <button type="button" className={`tab-button ${activeView === "list" ? "tab-active" : ""}`} onClick={() => setActiveView("list")}>
              Tagesliste
            </button>
            <button type="button" className={`tab-button ${activeView === "calendar" ? "tab-active" : ""}`} onClick={() => setActiveView("calendar")}>
              Kalender
            </button>
          </div>
        </div>

        <div className="toolbar filter-bar guard-toolbar">
          <form
            className="toolbar-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <input
              placeholder="Besucher, Firma, Ansprechpartner, Kennzeichen"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button type="submit">Suchen</button>
            {hasActiveFilters ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setStatusFilter("all");
                  setVisitScope("own");
                }}
              >
                Zurücksetzen
              </button>
            ) : null}
          </form>

          <div className="guard-filter-group" aria-label="Statusfilter">
            <button type="button" className={statusFilter === "all" ? "tab-button tab-active" : "tab-button"} onClick={() => setStatusFilter("all")}>
              Alle
            </button>
            <button type="button" className={statusFilter === "pre_registered" ? "tab-button tab-active" : "tab-button"} onClick={() => setStatusFilter("pre_registered")}>
              Vorangemeldet
            </button>
            <button type="button" className={statusFilter === "checked_in" ? "tab-button tab-active" : "tab-button"} onClick={() => setStatusFilter("checked_in")}>
              Eingecheckt
            </button>
            <button type="button" className={statusFilter === "checked_out" ? "tab-button tab-active" : "tab-button"} onClick={() => setStatusFilter("checked_out")}>
              Ausgecheckt
            </button>
          </div>
          {isGuardUser ? <div className="guard-filter-group" aria-label="Wachenfilter">
            <button type="button" className={visitScope === "own" ? "tab-button tab-active" : "tab-button"} onClick={() => setVisitScope("own")}>
              Eigene Wache
            </button>
            <button type="button" className={visitScope === "all" ? "tab-button tab-active" : "tab-button"} onClick={() => setVisitScope("all")}>
              Alle Besucher
            </button>
          </div> : null}
        </div>

        {activeView === "list" ? (
          <div className="card-grid stat-grid guard-stat-grid">
            <article className="panel mini-card guard-mini-card"><h3>Vorangemeldet heute</h3><p>{stats.preRegistered}</p></article>
            <article className="panel mini-card guard-mini-card"><h3>Aktuell eingecheckt</h3><p>{stats.checkedIn}</p></article>
            <article className="panel mini-card guard-mini-card"><h3>Ausgecheckt heute</h3><p>{stats.checkedOut}</p></article>
          </div>
        ) : null}

        {actionMessage ? <div className="feedback info">{actionMessage}</div> : null}
        {recentWalkInResult ? (
          <div className="toolbar guard-created-actions">
            <span className="badge status-active">Neue Besuchsnummer: {recentWalkInResult.badgeNumber}</span>
            <Link className="button-link" to={`/wache/besuche/${recentWalkInResult.visitId}`}>Details öffnen</Link>
            <Link className="button-link" to={`/wache/besuche/${recentWalkInResult.visitId}/druck`}>Besucherschein drucken</Link>
          </div>
        ) : null}
        {error ? <div className="feedback error">{error}</div> : null}
        {activeView === "list" && loading ? <div className="feedback info">Besuche werden geladen...</div> : null}
        {activeView === "calendar" && calendarLoading ? <div className="feedback info">Kalender wird geladen...</div> : null}

        {activeView === "list" && !loading ? (
          <div className="table-wrap table-shell">
            <table className="data-table guard-table">
              <thead>
                <tr>
                  <th className="cell-nowrap">Status</th>
                  <th className="cell-nowrap">Ankunft</th>
                  <th className="cell-nowrap">Besucher</th>
                  <th>Firma</th>
                  <th>Nationalität</th>
                  <th>Ansprechpartner</th>
                  <th>Abteilung</th>
                  <th className="cell-wrap">Besuchszweck</th>
                  <th className="cell-nowrap">Bestätigung</th>
                  <th className="cell-nowrap">Gültig bis</th>
                  <th className="actions-cell">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => {
                  const checkoutForm = checkoutState[visit.id] ?? buildInitialCheckoutState();
                  const visitTime = visit.checkInAt || visit.validFrom;
                  const badgeInputLength = Math.max(5, (visit.badgeNumber || "").length);

                  return (
                    <tr key={visit.id}>
                      <td>
                        <span className={statusClassName(visit.status)}>{formatStatus(visit.status)}</span>
                      </td>
                      <td className="cell-nowrap">{visit.status === "pre_registered" && visit.expectedArrivalTime ? `${visit.expectedArrivalTime} Uhr` : formatDateTime(visitTime)}</td>
                      <td className="cell-nowrap">{visit.firstName} {visit.lastName}</td>
                      <td>{visit.company}</td>
                      <td>{visit.nationalityName || visit.nationalityCode || "-"}</td>
                      <td>{visit.hostName}</td>
                      <td>{visit.hostDepartment}</td>
                      <td className="cell-wrap">{visit.purpose}</td>
                      <td className="cell-nowrap">{formatSignatureStatus(visit.hostSignatureStatus)}</td>
                      <td className="cell-nowrap">{formatDateOnly(visit.validUntil)}</td>
                      <td className="actions-cell">
                        <div className="action-row guard-action-row">
                          <div className="guard-action-strip">
                            {visit.status === "pre_registered" ? (
                              <button type="button" className="guard-primary-action" onClick={() => void handleCheckIn(visit.id)}>
                                Einchecken
                              </button>
                            ) : null}

                            <Link className="button-link" to={`/wache/besuche/${visit.id}`}>
                              Details
                            </Link>

                            {visit.status === "pre_registered" || visit.status === "checked_in" || visit.status === "checked_out" ? (
                              <Link className="button-link" to={`/wache/besuche/${visit.id}/druck`}>
                                Drucken
                              </Link>
                            ) : null}
                          </div>

                          {visit.status === "checked_in" ? (
                            <div className="checkout-box">
                              <input
                                className="guard-badge-input"
                                placeholder="Besuchsnummer"
                                maxLength={badgeInputLength}
                                value={checkoutForm.returnedVisitNumber}
                                onChange={(event) => updateCheckoutState(visit.id, { returnedVisitNumber: event.target.value.toUpperCase().slice(0, badgeInputLength) })}
                              />
                              <label className="checkbox-inline">
                                <input
                                  type="checkbox"
                                  checked={checkoutForm.signedByHostConfirmed}
                                  onChange={(event) => updateCheckoutState(visit.id, { signedByHostConfirmed: event.target.checked })}
                                />
                                Ansprechpartner-Bestätigung liegt vor
                              </label>
                              <button
                                type="button"
                                disabled={!checkoutForm.returnedVisitNumber.trim() || !checkoutForm.signedByHostConfirmed}
                                onClick={() => void handleCheckOut(visit.id)}
                              >
                                Auschecken
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!visits.length ? (
                  <tr>
                    <td colSpan={11}>Keine Besuche für die aktuelle Auswahl gefunden.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeView === "calendar" ? (
          <div className="calendar-layout">
            <div className="calendar-toolbar">
              <button type="button" className="secondary-button" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>
                Monat zurück
              </button>
              <strong className="calendar-title">
                {new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(calendarMonth)}
              </strong>
              <button type="button" className="secondary-button" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>
                Monat vor
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const now = new Date();
                  setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelectedDay(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
                }}
              >
                Heute
              </button>
            </div>

            <div className="calendar-grid">
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((weekday) => (
                <div key={weekday} className="calendar-weekday">{weekday}</div>
              ))}
              {monthDays.map((day) => {
                const dayKey = toDayKey(day);
                const items = calendarItemsByDay.get(dayKey) ?? [];
                const pre = items.filter((item) => item.status === "pre_registered").length;
                const checkedIn = items.filter((item) => item.status === "checked_in").length;
                const checkedOut = items.filter((item) => item.status === "checked_out").length;
                return (
                  <button
                    type="button"
                    key={dayKey}
                    className={`calendar-day ${day.getMonth() !== calendarMonth.getMonth() ? "calendar-day-muted" : ""} ${dayKey === todayKey ? "calendar-day-today" : ""} ${dayKey === selectedDayKey ? "calendar-day-selected" : ""}`}
                    onClick={() => setSelectedDay(new Date(day.getFullYear(), day.getMonth(), day.getDate()))}
                  >
                    <span className="calendar-day-number">{day.getDate()}</span>
                    <span className="calendar-day-count">{items.length} Besucher</span>
                    <span className="calendar-day-badges">
                      {pre ? <span className="badge status-pending">{pre} V</span> : null}
                      {checkedIn ? <span className="badge status-active">{checkedIn} E</span> : null}
                      {checkedOut ? <span className="badge status-done">{checkedOut} A</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="calendar-day-list panel">
              <h3>Besuche am {new Intl.DateTimeFormat("de-DE", { dateStyle: "full" }).format(selectedDay)}</h3>
              {selectedDayItems.length === 0 ? (
                <p className="section-copy">Keine Besuche für diesen Tag.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Uhrzeit</th>
                        <th>Besuchsnummer</th>
                        <th>Besucher</th>
                        <th>Firma</th>
                        <th>Ansprechpartner</th>
                        <th>Status</th>
                        <th>Wache</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDayItems.map((item) => (
                        <tr key={item.id}>
                          <td className="cell-nowrap">{formatDateTime(item.validFrom)}</td>
                          <td className="cell-nowrap">{item.badgeNumber || "-"}</td>
                          <td>{item.visitorName}</td>
                          <td>{item.company}</td>
                          <td>{item.hostName}</td>
                          <td><span className={statusClassName(item.status)}>{formatStatus(item.status)}</span></td>
                          <td>{item.gateName}</td>
                          <td>
                            <Link className="button-link" to={`/wache/besuche/${item.id}`}>Details</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </main>
      {walkInOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => {
          if (event.target === event.currentTarget && !walkInSaving) {
            setWalkInOpen(false);
          }
        }}>
          <div className="modal-card panel guard-walkin-modal">
            <div className="section-header">
              <div>
                <h3>Spontanbesucher anmelden</h3>
              </div>
            </div>
            {walkInError ? <Alert type="error"><strong>Spontananmeldung konnte nicht gespeichert werden.</strong><br />{walkInError}</Alert> : null}
            <div className="form-grid">
              {walkInSearchOpen ? <section className="walkin-search-panel">
                <div className="section-header">
                  <div>
                    <h3>Bestehenden Besucher suchen</h3>
                  </div>
                </div>
                <div className="form-grid two-columns">
                  <FormField label="Besucher suchen">
                    <input
                      placeholder="Name, Firma, Wohnort, Telefon, E-Mail, Kennzeichen oder Besuchsnummer"
                      value={visitorSearchForm.query}
                      onChange={(event) => setVisitorSearchForm({ query: event.target.value })}
                    />
                  </FormField>
                </div>
                {selectedVisitor ? (
                  <div className="feedback info">
                    Besucher übernommen: {selectedVisitor.firstName} {selectedVisitor.lastName} ({selectedVisitor.company})
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setSelectedVisitor(null);
                        setWalkInForm((current) => ({ ...current, existingVisitorId: null, clientRequestId: buildWalkInRequestId() }));
                        setWalkInSearchOpen(true);
                      }}
                    >
                      Auswahl aufheben
                    </button>
                  </div>
                ) : null}
                {visitorSearchLoading ? <div className="feedback info">Besucher werden gesucht...</div> : null}
                {!visitorSearchLoading && hasSearchCriteria(visitorSearchForm) && visitorSearchResults.length === 0 ? (
                  <div className="feedback info">Keine passenden Besucher gefunden.</div>
                ) : null}
                {visitorSearchResults.length > 0 ? (
                  <div className="walkin-search-results">
                    {visitorSearchResults.map((visitor) => (
                      <article
                        key={visitor.visitorId}
                        className="walkin-search-result"
                        role="button"
                        tabIndex={0}
                        onClick={() => selectExistingVisitor(visitor)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectExistingVisitor(visitor);
                          }
                        }}
                      >
                        <div className="walkin-search-result-head">
                          <div>
                            <strong>{visitor.firstName} {visitor.lastName}</strong>
                            <div>{visitor.company}</div>
                          </div>
                          <button type="button" onClick={(event) => {
                            event.stopPropagation();
                            selectExistingVisitor(visitor);
                          }}>Besucher übernehmen</button>
                        </div>
                        <div className="walkin-search-meta">
                          <span>Wohnort: {visitor.visitorCity || "-"}</span>
                          <span>Letzter Besuch: {formatDateTime(visitor.lastVisitAt)}</span>
                          <span>Bisherige Besuche: {visitor.visitCount}</span>
                          <span>Letzter Status: {visitor.lastVisitStatus ? formatStatus(visitor.lastVisitStatus) : "-"}</span>
                        </div>
                        {visitor.history.length > 0 ? (
                          <div className="table-wrap">
                            <table className="data-table compact-table">
                              <thead>
                                <tr>
                                  <th>Datum</th>
                                  <th>Ansprechpartner</th>
                                  <th>Bereich</th>
                                  <th>Zweck</th>
                                  <th>Status</th>
                                  <th>Wache</th>
                                </tr>
                              </thead>
                              <tbody>
                                {visitor.history.map((entry) => (
                                  <tr key={entry.visitId}>
                                    <td className="cell-nowrap">{formatDateTime(entry.validFrom)}</td>
                                    <td>{entry.hostName}</td>
                                    <td>{entry.hostDepartment || "-"}</td>
                                    <td>{entry.purpose}</td>
                                    <td><span className={statusClassName(entry.status)}>{formatStatus(entry.status)}</span></td>
                                    <td>{entry.gateName || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </section> : selectedVisitor ? (
                <div className="feedback info">
                  Besucher übernommen: {selectedVisitor.firstName} {selectedVisitor.lastName} ({selectedVisitor.company})
                  <button type="button" className="secondary-button" onClick={() => setWalkInSearchOpen(true)}>
                    Anderen Besucher suchen
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setSelectedVisitor(null);
                      setWalkInForm((current) => ({ ...current, existingVisitorId: null, clientRequestId: buildWalkInRequestId() }));
                      setWalkInSearchOpen(true);
                    }}
                  >
                    Auswahl aufheben
                  </button>
                </div>
              ) : null}

              {possibleDuplicates.length > 0 && !selectedVisitor ? (
                <div className="feedback warning walkin-duplicate-warning">
                  <strong>Möglicherweise ist dieser Besucher bereits vorhanden.</strong>
                  <div className="walkin-duplicate-list">
                    {possibleDuplicates.map((visitor) => (
                      <div key={visitor.visitorId} className="walkin-duplicate-item">
                        <span>{visitor.firstName} {visitor.lastName} - {visitor.company}{visitor.visitorCity ? `, ${visitor.visitorCity}` : ""}</span>
                        <button type="button" className="secondary-button" onClick={() => selectExistingVisitor(visitor)}>Vorhandenen Besucher verwenden</button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="form-grid two-columns">
                {!isGuardUser ? <FormField label="Wache" required error={walkInFieldErrors.gateId}>
                  <select required value={walkInForm.gateId} onChange={(event) => setWalkInForm((current) => ({ ...current, gateId: event.target.value }))}>
                    <option value="">Wache auswählen</option>
                    {walkInGates.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}
                  </select>
                </FormField> : null}
                <FormField label="Vorname" required error={walkInFieldErrors.firstName}><input value={walkInForm.firstName} onChange={(event) => setWalkInForm((current) => ({ ...current, firstName: event.target.value }))} /></FormField>
                <FormField label="Nachname" required error={walkInFieldErrors.lastName}><input value={walkInForm.lastName} onChange={(event) => setWalkInForm((current) => ({ ...current, lastName: event.target.value }))} /></FormField>
                <FormField label="Firma / Organisation" required error={walkInFieldErrors.company}><input value={walkInForm.company} onChange={(event) => setWalkInForm((current) => ({ ...current, company: event.target.value }))} /></FormField>
                <FormField label="Nationalität" required error={walkInFieldErrors.nationalityCode}><CountrySelect required value={walkInForm.nationalityCode} onChange={(value) => setWalkInForm((current) => ({ ...current, nationalityCode: value }))} /></FormField>
                <FormField label="Geburtsdatum" error={walkInFieldErrors.birthDate}><input type="date" value={walkInForm.birthDate} onChange={(event) => setWalkInForm((current) => ({ ...current, birthDate: event.target.value }))} /></FormField>
                <FormField label="Telefon Besucher" error={walkInFieldErrors.phone}><input value={walkInForm.phone} onChange={(event) => setWalkInForm((current) => ({ ...current, phone: event.target.value }))} /></FormField>
                <FormField label="E-Mail Besucher" error={walkInFieldErrors.email}><input value={walkInForm.email} onChange={(event) => setWalkInForm((current) => ({ ...current, email: event.target.value }))} /></FormField>
                <FormField label="Kennzeichen" error={walkInFieldErrors.licensePlate}><input value={walkInForm.licensePlate} onChange={(event) => setWalkInForm((current) => ({ ...current, licensePlate: event.target.value }))} /></FormField>
                <FormField label="Ansprechpartner" required error={walkInFieldErrors.hostName}><input value={walkInForm.hostName} onChange={(event) => setWalkInForm((current) => ({ ...current, hostName: event.target.value }))} /></FormField>
                <FormField label="Ansprechpartner E-Mail" error={walkInFieldErrors.hostEmail}><input value={walkInForm.hostEmail} onChange={(event) => setWalkInForm((current) => ({ ...current, hostEmail: event.target.value }))} /></FormField>
                <FormField label="Ansprechpartner Telefon" required error={walkInFieldErrors.hostPhone}><input value={walkInForm.hostPhone} onChange={(event) => setWalkInForm((current) => ({ ...current, hostPhone: event.target.value }))} /></FormField>
                <FormField label="Abteilung / Bereich" error={walkInFieldErrors.hostDepartment}><input value={walkInForm.hostDepartment} onChange={(event) => setWalkInForm((current) => ({ ...current, hostDepartment: event.target.value }))} /></FormField>
                <FormField label="Besuchszweck" required error={walkInFieldErrors.purpose}><input value={walkInForm.purpose} onChange={(event) => setWalkInForm((current) => ({ ...current, purpose: event.target.value }))} /></FormField>
                <FormField label="Gültig von" required error={walkInFieldErrors.validFrom}><input type="date" value={walkInForm.validFrom} onChange={(event) => setWalkInForm((current) => ({ ...current, validFrom: event.target.value }))} /></FormField>
                <FormField label="Gültig bis" required error={walkInFieldErrors.validUntil}><input type="date" value={walkInForm.validUntil} onChange={(event) => setWalkInForm((current) => ({ ...current, validUntil: event.target.value }))} /></FormField>
                <FormField label="Straße" error={walkInFieldErrors.visitorStreet}><input value={walkInForm.visitorStreet} onChange={(event) => setWalkInForm((current) => ({ ...current, visitorStreet: event.target.value }))} /></FormField>
                <FormField label="Hausnummer" error={walkInFieldErrors.visitorHouseNumber}><input value={walkInForm.visitorHouseNumber} onChange={(event) => setWalkInForm((current) => ({ ...current, visitorHouseNumber: event.target.value }))} /></FormField>
                <FormField label="PLZ" error={walkInFieldErrors.visitorPostalCode}><input value={walkInForm.visitorPostalCode} onChange={(event) => setWalkInForm((current) => ({ ...current, visitorPostalCode: event.target.value }))} /></FormField>
                <FormField label="Wohnort" error={walkInFieldErrors.visitorCity}><input value={walkInForm.visitorCity} onChange={(event) => setWalkInForm((current) => ({ ...current, visitorCity: event.target.value }))} /></FormField>
                <FormField label="Ausweisart" error={walkInFieldErrors.idDocumentType}>
                  <select value={walkInForm.idDocumentType} onChange={(event) => setWalkInForm((current) => ({ ...current, idDocumentType: event.target.value as WalkInFormState["idDocumentType"] }))}>
                    <option value="identity_card">Personalausweis</option>
                    <option value="passport">Reisepass</option>
                    <option value="service_id">Dienstausweis</option>
                    <option value="other">Sonstiges</option>
                  </select>
                </FormField>
                <FormField label="Ausweis gültig bis" error={walkInFieldErrors.idDocumentValidUntil}><input className={isPastDate(walkInForm.idDocumentValidUntil) ? "required-missing" : ""} type="date" value={walkInForm.idDocumentValidUntil} onChange={(event) => setWalkInForm((current) => ({ ...current, idDocumentValidUntil: event.target.value }))} /></FormField>
                <FormField label="Ausweisnummer" error={walkInFieldErrors.idDocumentNumber}><input value={walkInForm.idDocumentNumber} onChange={(event) => setWalkInForm((current) => ({ ...current, idDocumentNumber: event.target.value }))} /></FormField>
              </div>
              {isPastDate(walkInForm.idDocumentValidUntil) ? (
                <Alert type="warning">Der Ausweis ist abgelaufen. Die Anmeldung und das Einchecken sind trotzdem möglich.</Alert>
              ) : null}
              <FormField label="Bemerkung" error={walkInFieldErrors.notes}><textarea rows={3} value={walkInForm.notes} onChange={(event) => setWalkInForm((current) => ({ ...current, notes: event.target.value }))} /></FormField>
              <div className="row-actions">
                <button type="button" className="secondary-button" onClick={() => void handleWalkInCreate("save")} disabled={walkInSaving}>
                  {walkInSaving ? "Speichert..." : "Besuch speichern"}
                </button>
                <button type="button" onClick={() => void handleWalkInCreate("check_in")} disabled={walkInSaving}>
                  {walkInSaving ? "Speichert..." : "Speichern und einchecken"}
                </button>
                <button type="button" onClick={() => void handleWalkInCreate("check_in_and_print")} disabled={walkInSaving}>
                  {walkInSaving ? "Speichert..." : "Speichern, einchecken und drucken"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={resetWalkInDialog}
                  disabled={walkInSaving}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
