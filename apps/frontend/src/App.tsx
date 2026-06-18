import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type PropsWithChildren
} from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams
} from "react-router-dom";
import { Alert, Card, DataTable, FormField } from "./components/ui";
import { AdminPage } from "./pages/AdminPage";
import { VisitDetailPage } from "./pages/VisitDetailPage";
import {
  AppLayout,
  AuthProvider,
  type AdminAuditLog,
  type AdminBadgeText,
  type AdminFieldDefinition,
  type AdminGate,
  type AdminUser,
  type ApiError,
  buildInitialFormState,
  buildInitialCheckoutState,
  buildCheckoutStateFromVisit,
  buildGuardVisitEditState,
  type EditableAdminUser,
  extractFieldErrors,
  fetchJson,
  formatDateOnly,
  formatDateTime,
  formatFileSize,
  formatSignatureStatus,
  formatStatus,
  formatTextType,
  formatUserAgent,
  type FieldConfigExportPayload,
  type FieldErrorState,
  type FormState,
  type Gate,
  getNextStepHint,
  type GuardVisitEditState,
  BRANDING,
  type GuardCalendarItem,
  type NewFieldDefinitionForm,
  type CheckoutFormState,
  type SibeSummary,
  type SibeVisitRow,
  type SibeUserRow,
  type SibeVisitDetail,
  type SibeVisitorRow,
  type SiteMapSummary,
  statusClassName,
  type SubmitState,
  ThemeProvider,
  toDateInputValue,
  useAuth,
  type User,
  type VisitDetail,
  type VisitRow,
  RequireRoles
} from "./app/core";

function PublicPreRegistrationPage() {
  const [form, setForm] = useState<FormState>(() => buildInitialFormState());
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrorState>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    async function loadCsrf() {
      try {
        const payload = await fetchJson<{ csrfToken: string }>("/api/public/gates", { method: "GET", headers: {} });
        setCsrfToken(payload.csrfToken);
      } catch {
        setCsrfToken("");
      }
    }

    void loadCsrf();
  }, []);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitState({ kind: "idle" });
    setFieldErrors({});

    try {
      const payload = await fetchJson<{ message: string }>("/api/public/pre-registrations", {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({
          ...form,
          birthDate: form.birthDate || "",
          validFrom: form.validFrom,
          validUntil: form.validUntil
        })
      });

      setSubmitState({
        kind: "success",
        message: payload.message || "Voranmeldung wurde erfolgreich gespeichert."
      });
      setForm(buildInitialFormState());
    } catch (error) {
      const apiError = error as ApiError;
      setFieldErrors(extractFieldErrors(apiError) as FieldErrorState);
      setSubmitState({
        kind: "error",
        message:
          apiError.error === "FORBIDDEN"
            ? "Die Sitzung fuer das Formular ist abgelaufen. Bitte Seite neu laden."
            : apiError.message || "Die Voranmeldung konnte nicht gespeichert werden."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-form">
        <section>
          <div className="section-header">
            <div>
              <h2>Voranmeldung Besucher</h2>
              <p className="section-copy">* Pflichtfeld</p>
            </div>
          </div>

          <form className="pre-registration-form" onSubmit={handleSubmit}>
            <div className="form-section">
              <h3>Besucher</h3>
              <div className="form-grid two-columns">
                <label>
                  Vorname *
                  <input required value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} />
                  {fieldErrors.firstName ? <span className="field-error">{fieldErrors.firstName}</span> : null}
                </label>
                <label>
                  Nachname *
                  <input required value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} />
                  {fieldErrors.lastName ? <span className="field-error">{fieldErrors.lastName}</span> : null}
                </label>
                <label>
                  Firma / Organisation *
                  <input required value={form.company} onChange={(event) => updateField("company", event.target.value)} />
                  {fieldErrors.company ? <span className="field-error">{fieldErrors.company}</span> : null}
                </label>
                <label>
                  Geburtsdatum
                  <input type="date" max={toDateInputValue(new Date())} value={form.birthDate} onChange={(event) => updateField("birthDate", event.target.value)} />
                  {fieldErrors.birthDate ? <span className="field-error">{fieldErrors.birthDate}</span> : null}
                </label>
                <label>
                  Telefonnummer
                  <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
                </label>
                <label>
                  E-Mail-Adresse
                  <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
                </label>
                <label>
                  Kennzeichen
                  <input value={form.licensePlate} onChange={(event) => updateField("licensePlate", event.target.value)} />
                </label>
                <label>
                  Besuchszweck *
                  <input required value={form.purpose} onChange={(event) => updateField("purpose", event.target.value)} />
                  {fieldErrors.purpose ? <span className="field-error">{fieldErrors.purpose}</span> : null}
                </label>
              </div>
            </div>

            <div className="form-section">
              <h3>Ansprechpartner</h3>
              <div className="form-grid two-columns">
                <label>
                  Ansprechpartner *
                  <input required value={form.hostName} onChange={(event) => updateField("hostName", event.target.value)} />
                  {fieldErrors.hostName ? <span className="field-error">{fieldErrors.hostName}</span> : null}
                </label>
                <label>
                  Ansprechpartner E-Mail
                  <input type="email" value={form.hostEmail} onChange={(event) => updateField("hostEmail", event.target.value)} />
                </label>
                <label>
                  Ansprechpartner Telefon *
                  <input required value={form.hostPhone} onChange={(event) => updateField("hostPhone", event.target.value)} />
                  {fieldErrors.hostPhone ? <span className="field-error">{fieldErrors.hostPhone}</span> : null}
                </label>
                <label>
                  Abteilung / Bereich
                  <input
                    value={form.hostDepartment}
                    onChange={(event) => updateField("hostDepartment", event.target.value)}
                  />
                  {fieldErrors.hostDepartment ? <span className="field-error">{fieldErrors.hostDepartment}</span> : null}
                </label>
                <label>
                  Gueltig von *
                  <input
                    required
                    type="date"
                    value={form.validFrom}
                    onChange={(event) => updateField("validFrom", event.target.value)}
                  />
                  {fieldErrors.validFrom ? <span className="field-error">{fieldErrors.validFrom}</span> : null}
                </label>
                <label>
                  Gueltig bis *
                  <input
                    required
                    type="date"
                    value={form.validUntil}
                    onChange={(event) => updateField("validUntil", event.target.value)}
                  />
                  {fieldErrors.validUntil ? <span className="field-error">{fieldErrors.validUntil}</span> : null}
                </label>
              </div>
              <label>
                Bemerkung
                <textarea rows={4} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={isSubmitting || !csrfToken}>
                {isSubmitting ? "Speichert..." : "Voranmeldung senden"}
              </button>
            </div>

            {submitState.kind === "success" ? <div className="feedback success">{submitState.message}</div> : null}
            {submitState.kind === "error" ? <div className="feedback error">{submitState.message}</div> : null}
          </form>
        </section>
      </main>
    </AppLayout>
  );
}

function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(user.role === "admin" ? "/admin" : user.role === "sibe" ? "/sibe" : "/wache", { replace: true });
    }
  }, [navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = await fetchJson<{ user: User; redirectTo: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });

      setUser(payload.user);
      navigate((location.state as { from?: string } | null)?.from || payload.redirectTo, { replace: true });
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Benutzername oder Passwort ist falsch.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <main className="login-layout">
        <section className="panel login-panel">
          <h2>Anmeldung</h2>
          <form className="pre-registration-form" onSubmit={handleSubmit}>
            <label>
              Benutzername
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label>
              Passwort
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "Prueft..." : "Anmelden"}
            </button>
            {error ? <div className="feedback error">{error}</div> : null}
          </form>
        </section>
      </main>
    </AppLayout>
  );
}

function GuardDashboardPage() {
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [calendarItems, setCalendarItems] = useState<GuardCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [signatureFilter, setSignatureFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<"list" | "calendar">("list");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [checkoutState, setCheckoutState] = useState<Record<string, CheckoutFormState>>({});
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
      params.set("signatureStatus", signatureFilter);

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
      setError(errorPayload.message || "Die Tagesuebersicht konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [search, signatureFilter, statusFilter]);

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const range = monthRange(calendarMonth);
      const params = new URLSearchParams();
      params.set("from", toDateInputValue(range.from));
      params.set("to", toDateInputValue(range.to));
      params.set("status", statusFilter);
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
  }, [calendarMonth, search, statusFilter]);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

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

  function updateCheckoutState(visitId: string, next: Partial<CheckoutFormState>) {
    setCheckoutState((existing) => ({
      ...existing,
      [visitId]: {
        ...(existing[visitId] ?? buildInitialCheckoutState()),
        ...next
      }
    }));
  }

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide guard-page">
        <div className="section-header">
          <div>
            <h2>Wache</h2>
            <p className="section-copy">Tagesliste und Kalender fuer den operativen Ueberblick.</p>
          </div>
          <div className="section-tabs">
            <button type="button" className={`tab-button ${activeView === "list" ? "tab-active" : ""}`} onClick={() => setActiveView("list")}>
              Tagesliste
            </button>
            <button type="button" className={`tab-button ${activeView === "calendar" ? "tab-active" : ""}`} onClick={() => setActiveView("calendar")}>
              Kalender
            </button>
          </div>
        </div>

        <div className="toolbar filter-bar">
          <form
            className="toolbar-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput);
            }}
          >
            <input
              placeholder="Suche nach Besucher, Firma, Ansprechpartner oder Kennzeichen"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button type="submit">Suchen</button>
          </form>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Alle</option>
            <option value="pre_registered">Vorangemeldet</option>
            <option value="checked_in">Eingecheckt</option>
            <option value="checked_out">Ausgecheckt</option>
            <option value="cancelled">Storniert</option>
          </select>

          {activeView === "list" ? (
            <select value={signatureFilter} onChange={(event) => setSignatureFilter(event.target.value)}>
              <option value="all">Alle Unterschriften</option>
              <option value="pending">Offen</option>
              <option value="signed_same_day">Vorhanden</option>
              <option value="signed_later">Nachgereicht</option>
              <option value="missing_exception">Fehlt mit Ausnahme</option>
              <option value="not_required">Nicht erforderlich</option>
            </select>
          ) : null}
        </div>

        {activeView === "list" ? (
          <div className="card-grid stat-grid">
            <article className="panel mini-card"><h3>Vorangemeldet heute</h3><p>{stats.preRegistered}</p></article>
            <article className="panel mini-card"><h3>Aktuell eingecheckt</h3><p>{stats.checkedIn}</p></article>
            <article className="panel mini-card"><h3>Ausgecheckt heute</h3><p>{stats.checkedOut}</p></article>
          </div>
        ) : null}

        {actionMessage ? <div className="feedback info">{actionMessage}</div> : null}
        {error ? <div className="feedback error">{error}</div> : null}
        {activeView === "list" && loading ? <div className="feedback info">Besuche werden geladen...</div> : null}
        {activeView === "calendar" && calendarLoading ? <div className="feedback info">Kalender wird geladen...</div> : null}

        {activeView === "list" && !loading ? (
          <div className="table-wrap table-shell">
            <table className="data-table guard-table">
              <thead>
                <tr>
                  <th className="cell-nowrap">Status</th>
                  <th className="cell-nowrap">Uhrzeit</th>
                  <th className="cell-nowrap">Besucher</th>
                  <th>Firma</th>
                  <th>Ansprechpartner</th>
                  <th>Abteilung</th>
                  <th className="cell-wrap">Besuchszweck</th>
                  <th className="cell-nowrap">Unterschrift</th>
                  <th className="cell-nowrap">Gueltig bis</th>
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
                      <td className="cell-nowrap">{formatDateTime(visitTime)}</td>
                      <td className="cell-nowrap">{visit.firstName} {visit.lastName}</td>
                      <td>{visit.company}</td>
                      <td>{visit.hostName}</td>
                      <td>{visit.hostDepartment}</td>
                      <td className="cell-wrap">{visit.purpose}</td>
                      <td className="cell-nowrap">{formatSignatureStatus(visit.hostSignatureStatus)}</td>
                      <td className="cell-nowrap">{formatDateOnly(visit.validUntil)}</td>
                      <td className="actions-cell">
                        <div className="row-actions action-stack">
                          {visit.status === "pre_registered" ? (
                            <button type="button" onClick={() => void handleCheckIn(visit.id)}>
                              Einchecken
                            </button>
                          ) : null}

                          <Link className="button-link" to={`/wache/besuche/${visit.id}`}>
                            Details
                          </Link>

                          {visit.status === "pre_registered" || visit.status === "checked_in" || visit.status === "checked_out" ? (
                            <Link className="button-link" to={`/wache/besuche/${visit.id}/druck`}>
                              Besucherschein drucken
                            </Link>
                          ) : null}

                          {visit.status === "checked_in" ? (
                            <div className="checkout-box">
                              <input
                                placeholder="Besuchsnummer vom Besucherschein"
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
                                Unterschrift vom Ansprechpartner erledigt
                              </label>
                              <button
                                type="button"
                                disabled={
                                  !checkoutForm.returnedVisitNumber.trim()
                                  || !checkoutForm.signedByHostConfirmed
                                }
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
                    <td colSpan={10}>Keine Besuche fuer die aktuelle Auswahl gefunden.</td>
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
                Monat zurueck
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
                <p className="section-copy">Keine Besuche fuer diesen Tag.</p>
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
                          <td className="cell-nowrap">{formatDateOnly(item.validFrom)}</td>
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
    </AppLayout>
  );
}

function PrintViewPage() {
  const { id } = useParams();
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVisit() {
      setLoading(true);

      try {
        const payload = await fetchJson<{ visit: VisitDetail }>(`/api/guard/visits/${id}`, {
          method: "GET",
          headers: {}
        });
        setVisit(payload.visit);
      } catch (apiError) {
        const errorPayload = apiError as ApiError;
        setError(errorPayload.message || "Die Druckansicht konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    }

    void loadVisit();
  }, [id]);

  async function handlePrint() {
    if (!id) {
      return;
    }
    if (visit?.completeness?.errors?.length) {
      setError(`Vor dem Drucken fehlen Pflichtdaten: ${visit.completeness.errors.map((item) => item.message).join(" ")}`);
      return;
    }

    try {
      await fetchJson<{ success: boolean }>(`/api/guard/visits/${id}/print-log`, {
        method: "POST",
        body: JSON.stringify({})
      });
    } catch {
      // Auditlog-Versuch darf den Druck nicht blockieren.
    }

    window.print();
  }

  const securityTexts = visit?.badgeTexts.filter((text) => text.textType === "security_notice" || text.textType === "footer") ?? [];
  const photoBanText = visit?.badgeTexts.find((text) => text.textType === "photo_ban")?.content
    || "Fotografieren und Filmen auf dem Gelaende ist verboten.";
  const signatureText = visit?.badgeTexts.find((text) => text.textType === "signature_notice")?.content
    || "Vor Ausfahrt / Verlassen des Gelaendes durch den Ansprechpartner zu unterschreiben.";
  const hasOptionalPageTwoContent = Boolean((visit?.siteMap || securityTexts.length));

  return (
    <AppLayout>
      <main className="panel print-panel">
        {loading ? <div className="feedback info">Druckansicht wird geladen...</div> : null}
        {error ? <div className="feedback error">{error}</div> : null}

        {visit ? (
          <div className="print-layout">
            <div className="print-toolbar no-print">
              <button type="button" onClick={handlePrint} disabled={Boolean(visit.completeness?.errors?.length)}>Drucken</button>
              <Link className="button-link" to="/wache">Zurueck zur Wache</Link>
            </div>

            {visit.completeness?.errors?.length ? (
              <div className="feedback error no-print">
                Vor dem Drucken fehlen noch Pflichtdaten:
                <ul className="text-list">
                  {visit.completeness.errors.map((item, index) => <li key={`${item.field}-${index}`}>{item.message}</li>)}
                </ul>
                <Link className="button-link" to={`/wache/besuche/${visit.id}`}>Daten jetzt ergaenzen</Link>
              </div>
            ) : null}

            <div className="feedback info no-print">
              Wenn der Browser URL, Datum oder Seitenzahl mitdruckt, bitte im Druckdialog die Option fuer Kopf- und Fusszeilen deaktivieren.
            </div>

            <div className="badge-sheet print-page page-1">
              <header className="badge-header">
                <div>
                  <p className="eyebrow">Besucherschein</p>
                  <h2>BESUCHER</h2>
                </div>
                <div className="badge-number">
                  Besuchsnummer
                  <strong>{visit.badgeNumber || visit.id.slice(0, 8).toUpperCase()}</strong>
                </div>
              </header>

              <section className="badge-grid">
                <div><span>Name</span><strong>{visit.firstName} {visit.lastName}</strong></div>
                <div><span>Geburtsdatum</span><strong>{formatDateOnly(visit.birthDate)}</strong></div>
                <div><span>Firma / Organisation</span><strong>{visit.company}</strong></div>
                <div><span>Adresse</span><strong>{[visit.visitorStreet, visit.visitorHouseNumber, visit.visitorPostalCode, visit.visitorCity].filter(Boolean).join(", ") || "-"}</strong></div>
                <div><span>Ansprechpartner</span><strong>{visit.hostName}</strong></div>
                <div><span>Ansprechpartner Kontakt</span><strong>{visit.hostPhone || visit.hostEmail ? [visit.hostPhone, visit.hostEmail].filter(Boolean).join(" / ") : "-"}</strong></div>
                <div><span>Besuchszweck</span><strong>{visit.purpose}</strong></div>
                <div><span>Wache / Eingang</span><strong>{visit.gateName}</strong></div>
                <div><span>Gueltig von</span><strong>{formatDateOnly(visit.validFrom)}</strong></div>
                <div><span>Gueltig bis</span><strong>{formatDateOnly(visit.validUntil)}</strong></div>
                <div><span>Kennzeichen</span><strong>{visit.licensePlate || "-"}</strong></div>
                <div><span>Ausweisart</span><strong>{visit.idDocumentType || "-"}</strong></div>
                <div><span>Ausweis gueltig bis</span><strong>{formatDateOnly(visit.idDocumentValidUntil)}</strong></div>
                <div><span>Ausweisnummer</span><strong>{visit.idDocumentNumber || "-"}</strong></div>
                <div><span>Ausstellungsort</span><strong>{visit.idDocumentIssuingPlace || "-"}</strong></div>
              </section>

              <section className="signature-section">
                <h3>Unterschrift Ansprechpartner</h3>
                <div className="signature-box">
                  <div className="signature-line" />
                </div>
                <p>{signatureText}</p>
              </section>
            </div>

            {hasOptionalPageTwoContent ? (
              <div className="badge-sheet print-page page-2">
                <section className="print-columns">
                  <div className="print-block avoid-break">
                    <h3>Sicherheitshinweise</h3>
                    {securityTexts.length ? (
                      <ul className="text-list compact-list">
                        {securityTexts.map((text) => (
                          <li key={text.id}>
                            <strong>{text.name}:</strong> {text.content}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul className="text-list compact-list">
                        <li>Fotografieren nur mit ausdruecklicher Freigabe.</li>
                        <li>Bitte sichtbar tragen und beim Verlassen an der Pforte abmelden.</li>
                      </ul>
                    )}

                    <div className="print-callout">
                      <strong>Fotografierverbot</strong>
                      <p>{photoBanText}</p>
                    </div>
                  </div>
                  <div className="print-block avoid-break">
                    <h3>Gelaendeplan</h3>
                    {visit.siteMap ? (
                      <img className="site-map site-map-print" src={visit.siteMap.filePath} alt={visit.siteMap.name} />
                    ) : (
                      <p className="section-copy">Kein aktiver Gelaendeplan hinterlegt.</p>
                    )}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        ) : null}
      </main>
    </AppLayout>
  );
}

function SibeDashboardPage() {
  const [summary, setSummary] = useState<SibeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSummary() {
      try {
        const payload = await fetchJson<SibeSummary>("/api/sibe/summary", { method: "GET", headers: {} });
        setSummary(payload);
      } catch (apiError) {
        const errorPayload = apiError as ApiError;
        setError(errorPayload.message || "SiBe-Dashboard konnte nicht geladen werden.");
      }
    }

    void loadSummary();
  }, []);

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-full admin-page-shell">
        <div className="section-header">
          <div>
            <h2>SiBe Dashboard</h2>
            <p className="section-copy">Recherche und Auswertung fuer Sicherheitsbeauftragte.</p>
          </div>
        </div>

        {error ? <Alert type="error">{error}</Alert> : null}

        <div className="card-grid stat-grid">
          <article className="panel mini-card"><h3>Besucher gesamt</h3><p>{summary?.visitorsTotal ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Aktive Besucher</h3><p>{summary?.activeVisitors ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Heutige Besuche</h3><p>{summary?.todaysVisits ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Aktuell eingecheckt</h3><p>{summary?.checkedInVisitors ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Unterschrift offen</h3><p>{summary?.signaturesPending ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Nachgereicht</h3><p>{summary?.signaturesFollowUp ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Ausnahmen</h3><p>{summary?.signaturesExceptions ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Benutzer gesamt</h3><p>{summary?.usersTotal ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Aktive Benutzer</h3><p>{summary?.activeUsers ?? "-"}</p></article>
        </div>

        <div className="row-actions">
          <Link className="button-link" to="/sibe/besucher">Besucher suchen</Link>
          <Link className="button-link" to="/sibe/benutzer">Benutzer suchen</Link>
        </div>
      </main>
    </AppLayout>
  );
}

function SibeVisitorsPage() {
  const [visits, setVisits] = useState<SibeVisitRow[]>([]);
  const [visitors, setVisitors] = useState<SibeVisitorRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("all");
  const [signatureStatus, setSignatureStatus] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("");
  const [hostFilter, setHostFilter] = useState("");
  const [gateFilter, setGateFilter] = useState("");
  const [licensePlateFilter, setLicensePlateFilter] = useState("");
  const [badgeFilter, setBadgeFilter] = useState("");

  function applyRangePreset(preset: "today" | "yesterday" | "week" | "last7" | "month") {
    const now = new Date();
    const end = new Date(now);
    let start = new Date(now);
    if (preset === "today") {
      // keep start/end as today
    } else if (preset === "yesterday") {
      start.setDate(now.getDate() - 1);
      end.setDate(now.getDate() - 1);
    } else if (preset === "week") {
      const day = (now.getDay() + 6) % 7;
      start.setDate(now.getDate() - day);
    } else if (preset === "last7") {
      start.setDate(now.getDate() - 6);
    } else if (preset === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    setDateFrom(toDateInputValue(start));
    setDateTo(toDateInputValue(end));
  }

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const visitParams = new URLSearchParams();
      if (search) visitParams.set("search", search);
      if (status) visitParams.set("status", status);
      if (signatureStatus) visitParams.set("signatureStatus", signatureStatus);
      if (dateFrom) visitParams.set("from", dateFrom);
      if (dateTo) visitParams.set("to", dateTo);
      if (companyFilter) visitParams.set("company", companyFilter);
      if (hostFilter) visitParams.set("hostName", hostFilter);
      if (gateFilter) visitParams.set("gate", gateFilter);
      if (licensePlateFilter) visitParams.set("licensePlate", licensePlateFilter);
      if (badgeFilter) visitParams.set("badgeNumber", badgeFilter);

      const [visitPayload, visitorPayload] = await Promise.all([
        fetchJson<{ visits: SibeVisitRow[] }>(`/api/sibe/visits?${visitParams.toString()}`, { method: "GET", headers: {} }),
        fetchJson<{ visitors: SibeVisitorRow[] }>(`/api/sibe/visitors?${visitParams.toString()}`, { method: "GET", headers: {} })
      ]);
      setVisits(visitPayload.visits);
      setVisitors(visitorPayload.visitors);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Besucher konnten nicht geladen werden.");
    }
  }, [badgeFilter, companyFilter, dateFrom, dateTo, gateFilter, hostFilter, licensePlateFilter, search, signatureStatus, status]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
        <div className="section-header">
          <div>
            <h2>SiBe Besucher</h2>
            <p className="section-copy">Besucher, Besuche und Historie lesen, filtern und durchsuchen.</p>
          </div>
        </div>

        <div className="toolbar filter-bar">
          <input
            placeholder="Name, Firma, Ansprechpartner, Kennzeichen oder Besuchsnummer"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Alle</option>
            <option value="pre_registered">Vorangemeldet</option>
            <option value="checked_in">Eingecheckt</option>
            <option value="checked_out">Ausgecheckt</option>
            <option value="cancelled">Storniert</option>
            <option value="overdue">Ueberfaellig</option>
          </select>
          <select value={signatureStatus} onChange={(event) => setSignatureStatus(event.target.value)}>
            <option value="all">Alle Unterschriften</option>
            <option value="pending">Offen</option>
            <option value="signed_same_day">Vorhanden</option>
            <option value="signed_later">Nachgereicht</option>
            <option value="missing_exception">Fehlt mit Ausnahme</option>
            <option value="not_required">Nicht erforderlich</option>
          </select>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <input placeholder="Firma" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} />
          <input placeholder="Ansprechpartner" value={hostFilter} onChange={(event) => setHostFilter(event.target.value)} />
          <input placeholder="Wache" value={gateFilter} onChange={(event) => setGateFilter(event.target.value)} />
          <input placeholder="Kennzeichen" value={licensePlateFilter} onChange={(event) => setLicensePlateFilter(event.target.value)} />
          <input placeholder="Besuchsnummer" value={badgeFilter} onChange={(event) => setBadgeFilter(event.target.value)} />
        </div>
        <div className="toolbar filter-bar">
          <button type="button" className="secondary-button" onClick={() => applyRangePreset("today")}>Heute</button>
          <button type="button" className="secondary-button" onClick={() => applyRangePreset("yesterday")}>Gestern</button>
          <button type="button" className="secondary-button" onClick={() => applyRangePreset("week")}>Diese Woche</button>
          <button type="button" className="secondary-button" onClick={() => applyRangePreset("last7")}>Letzte 7 Tage</button>
          <button type="button" className="secondary-button" onClick={() => applyRangePreset("month")}>Dieser Monat</button>
          <button type="button" className="secondary-button" onClick={() => { setDateFrom(""); setDateTo(""); }}>Zeitraum loeschen</button>
        </div>

        {error ? <Alert type="error">{error}</Alert> : null}

        <Card>
          <h3>Besuchsvorgaenge</h3>
          <DataTable>
            <thead>
              <tr>
                <th>Besuchername</th>
                <th>Firma</th>
                <th>Kennzeichen</th>
                <th>Besuchsnummer</th>
                <th>Status</th>
                <th>Wache</th>
                <th>Ansprechpartner</th>
                <th>Gueltig von</th>
                <th>Gueltig bis</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Unterschrift</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((visit) => (
                <tr key={visit.id}>
                  <td>{visit.visitorName}</td>
                  <td>{visit.company}</td>
                  <td>{visit.licensePlate || "-"}</td>
                  <td>{visit.badgeNumber || visit.id.slice(0, 8).toUpperCase()}</td>
                  <td><span className={statusClassName(visit.status)}>{formatStatus(visit.status)}</span></td>
                  <td>{visit.gateName}</td>
                  <td>{visit.hostName}</td>
                  <td>{formatDateOnly(visit.validFrom)}</td>
                  <td>{formatDateOnly(visit.validUntil)}</td>
                  <td>{formatDateTime(visit.checkInAt)}</td>
                  <td>{formatDateTime(visit.checkOutAt)}</td>
                  <td>{formatSignatureStatus(visit.hostSignatureStatus)}</td>
                  <td><Link className="button-link" to={`/sibe/besucher/${visit.id}`}>Details</Link></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card>
          <h3>Besucher</h3>
          <DataTable>
            <thead>
              <tr>
                <th>Name</th>
                <th>Geburtsdatum</th>
                <th>Firma</th>
                <th>Telefon</th>
                <th>E-Mail</th>
                <th>Besuche</th>
                <th>Letzter Besuch</th>
                <th>Archiviert</th>
              </tr>
            </thead>
            <tbody>
              {visitors.map((visitor) => (
                <tr key={visitor.id}>
                  <td>{visitor.firstName} {visitor.lastName}</td>
                  <td>{formatDateOnly(visitor.birthDate)}</td>
                  <td>{visitor.company}</td>
                  <td>{visitor.phone || "-"}</td>
                  <td>{visitor.email || "-"}</td>
                  <td>{visitor.visitCount}</td>
                  <td>{formatDateTime(visitor.lastVisitAt)}</td>
                  <td>{formatDateTime(visitor.archivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </main>
    </AppLayout>
  );
}

function SibeVisitDetailPage() {
  const { id } = useParams();
  const [visit, setVisit] = useState<SibeVisitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVisit() {
      try {
        const payload = await fetchJson<{ visit: SibeVisitDetail }>(`/api/sibe/visits/${id}`, { method: "GET", headers: {} });
        setVisit(payload.visit);
      } catch (apiError) {
        const errorPayload = apiError as ApiError;
        setError(errorPayload.message || "Besuch konnte nicht geladen werden.");
      }
    }

    void loadVisit();
  }, [id]);

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
        <div className="section-header">
          <div>
            <h2>SiBe Besuchsdetails</h2>
            <p className="section-copy">Reine Leseansicht fuer Recherche und Nachvollziehbarkeit.</p>
          </div>
        </div>
        {error ? <Alert type="error">{error}</Alert> : null}
        {visit ? (
          <>
            <dl className="details-list">
              <div><dt>Besuchsnummer</dt><dd>{visit.badgeNumber || visit.id.slice(0, 8).toUpperCase()}</dd></div>
              <div><dt>Status</dt><dd>{formatStatus(visit.status)}</dd></div>
              <div><dt>Besuchername</dt><dd>{visit.firstName} {visit.lastName}</dd></div>
              <div><dt>Geburtsdatum</dt><dd>{formatDateOnly(visit.birthDate)}</dd></div>
              <div><dt>Firma</dt><dd>{visit.company}</dd></div>
              <div><dt>Telefon</dt><dd>{visit.visitorPhone || "-"}</dd></div>
              <div><dt>E-Mail</dt><dd>{visit.visitorEmail || "-"}</dd></div>
              <div><dt>Kennzeichen</dt><dd>{visit.licensePlate || "-"}</dd></div>
              <div><dt>Strasse</dt><dd>{visit.visitorStreet || "-"}</dd></div>
              <div><dt>Hausnummer</dt><dd>{visit.visitorHouseNumber || "-"}</dd></div>
              <div><dt>PLZ</dt><dd>{visit.visitorPostalCode || "-"}</dd></div>
              <div><dt>Ort</dt><dd>{visit.visitorCity || "-"}</dd></div>
              <div><dt>Ausweisart</dt><dd>{visit.idDocumentType || "-"}</dd></div>
              <div><dt>Ausweis gueltig bis</dt><dd>{formatDateOnly(visit.idDocumentValidUntil)}</dd></div>
              <div><dt>Ausweisnummer</dt><dd>{visit.idDocumentNumber || "-"}</dd></div>
              <div><dt>Ausstellungsort</dt><dd>{visit.idDocumentIssuingPlace || "-"}</dd></div>
              <div><dt>Ansprechpartner</dt><dd>{visit.hostName}</dd></div>
              <div><dt>Ansprechpartner E-Mail</dt><dd>{visit.hostEmail || "-"}</dd></div>
              <div><dt>Ansprechpartner Telefon</dt><dd>{visit.hostPhone || "-"}</dd></div>
              <div><dt>Abteilung / Bereich</dt><dd>{visit.hostDepartment}</dd></div>
              <div><dt>Dienststelle / Einheit</dt><dd>{visit.hostUnit || "-"}</dd></div>
              <div><dt>Gebaeude</dt><dd>{visit.hostBuilding || "-"}</dd></div>
              <div><dt>Zimmer</dt><dd>{visit.hostRoom || "-"}</dd></div>
              <div><dt>Apparat / Durchwahl</dt><dd>{visit.hostExtension || "-"}</dd></div>
              <div><dt>Besuchszweck</dt><dd>{visit.purpose}</dd></div>
              <div><dt>Besuchszweck-Art</dt><dd>{visit.visitPurposeType || "-"}</dd></div>
              <div><dt>Im Auftrag</dt><dd>{visit.visitCompanyOrder || "-"}</dd></div>
              <div><dt>Wache</dt><dd>{visit.gateName}</dd></div>
              <div><dt>Gueltig von</dt><dd>{formatDateOnly(visit.validFrom)}</dd></div>
              <div><dt>Gueltig bis</dt><dd>{formatDateOnly(visit.validUntil)}</dd></div>
              <div><dt>Check-in-Zeit</dt><dd>{formatDateTime(visit.checkInAt)}</dd></div>
              <div><dt>Check-in durch</dt><dd>{visit.checkInBy || "-"}</dd></div>
              <div><dt>Check-out-Zeit</dt><dd>{formatDateTime(visit.checkOutAt)}</dd></div>
              <div><dt>Check-out durch</dt><dd>{visit.checkOutBy || "-"}</dd></div>
              <div><dt>Bemerkung</dt><dd>{visit.notes || "-"}</dd></div>
              <div><dt>Ausfahrt-Bemerkung</dt><dd>{visit.checkoutNote || "-"}</dd></div>
              <div><dt>Unterschriftsstatus</dt><dd>{formatSignatureStatus(visit.hostSignatureStatus)}</dd></div>
              <div><dt>Unterschriftsdatum</dt><dd>{formatDateOnly(visit.hostSignatureDate)}</dd></div>
              <div><dt>Erfasst durch</dt><dd>{visit.hostSignatureConfirmedBy || "-"}</dd></div>
              <div><dt>Erfasst am</dt><dd>{formatDateTime(visit.hostSignatureConfirmedAt)}</dd></div>
              <div><dt>Hinweis Unterschrift</dt><dd>{visit.hostSignatureNote || "-"}</dd></div>
              <div><dt>Besuchsende-Typ</dt><dd>{visit.visitEndType || "-"}</dd></div>
              <div><dt>Weitergeleitet an</dt><dd>{visit.forwardedToNote || "-"}</dd></div>
              <div><dt>Rueckgabe bestaetigt</dt><dd>{visit.deviceReturnConfirmed ? "Ja" : "Nein"}</dd></div>
              <div><dt>Rueckgabe-Zeit</dt><dd>{formatDateTime(visit.deviceReturnedAt)}</dd></div>
              <div><dt>Rueckgabe durch</dt><dd>{visit.deviceReturnedBy || "-"}</dd></div>
            </dl>
            <div className="row-actions">
              <Link className="button-link" to="/sibe/besucher">Zurueck</Link>
            </div>
          </>
        ) : null}
      </main>
    </AppLayout>
  );
}

function SibeUsersPage() {
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicPreRegistrationPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/wache"
        element={
          <RequireRoles allowedRoles={["admin", "guard"]} redirectTo="/">
            <GuardDashboardPage />
          </RequireRoles>
        }
      />
      <Route
        path="/wache/besuche/:id/druck"
        element={
          <RequireRoles allowedRoles={["admin", "guard"]} redirectTo="/" >
            <PrintViewPage />
          </RequireRoles>
        }
      />
      <Route
        path="/wache/besuche/:id"
        element={
          <RequireRoles allowedRoles={["admin", "guard"]} redirectTo="/" >
            <VisitDetailPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} redirectTo="/" >
            <SibeDashboardPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/besucher"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} redirectTo="/" >
            <SibeVisitorsPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/besucher/:id"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} redirectTo="/" >
            <SibeVisitDetailPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/benutzer"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} redirectTo="/" >
            <SibeUsersPage />
          </RequireRoles>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireRoles allowedRoles={["admin"]} redirectTo="/" >
            <AdminPage />
          </RequireRoles>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
