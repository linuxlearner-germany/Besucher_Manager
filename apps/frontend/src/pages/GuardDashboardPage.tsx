import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AppLayout,
  type ApiError,
  buildInitialCheckoutState,
  fetchJson,
  formatDateOnly,
  formatDateTime,
  formatSignatureStatus,
  formatStatus,
  statusClassName,
  toDateInputValue,
  type CheckoutFormState,
  type GuardCalendarItem,
  type VisitRow
} from "../app/core";

export function GuardDashboardPage() {
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
