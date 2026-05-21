import {
  createContext,
  useCallback,
  useContext,
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

type User = {
  id: string;
  username: string;
  role: "admin" | "guard";
  gateId: string | null;
};

type Gate = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
};

type VisitRow = {
  id: string;
  status: string;
  validFrom: string;
  validUntil: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  firstName: string;
  lastName: string;
  company: string;
  hostName: string;
  hostDepartment: string;
  purpose: string;
  gateId: string;
  gateName: string;
  licensePlate: string | null;
  signedByHostConfirmed: boolean;
  checkoutNote: string | null;
};

type VisitDetail = VisitRow & {
  notes: string | null;
  badgeNumber: string | null;
  siteMap: { id: string; name: string; filePath: string } | null;
  badgeTexts: Array<{ id: string; name: string; textType: string; content: string }>;
};

type FormState = {
  firstName: string;
  lastName: string;
  company: string;
  hostName: string;
  hostDepartment: string;
  purpose: string;
  gateId: string;
  validFrom: string;
  validUntil: string;
  phone: string;
  email: string;
  licensePlate: string;
  notes: string;
};

type ApiError = {
  error: string;
  message?: string;
  details?: unknown;
  retryAfterSeconds?: number;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type CheckoutFormState = {
  signed: boolean;
  note: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatStatus(status: string): string {
  switch (status) {
    case "pre_registered":
      return "Vorangemeldet";
    case "checked_in":
      return "Eingecheckt";
    case "checked_out":
      return "Ausgecheckt";
    default:
      return status;
  }
}

function statusClassName(status: string): string {
  switch (status) {
    case "pre_registered":
      return "badge status-pending";
    case "checked_in":
      return "badge status-active";
    case "checked_out":
      return "badge status-done";
    default:
      return "badge";
  }
}

function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function buildInitialFormState(): FormState {
  const validFrom = new Date();
  const validUntil = new Date(validFrom.getTime() + 2 * 60 * 60 * 1000);

  return {
    firstName: "",
    lastName: "",
    company: "",
    hostName: "",
    hostDepartment: "",
    purpose: "",
    gateId: "",
    validFrom: toLocalInputValue(validFrom),
    validUntil: toLocalInputValue(validUntil),
    phone: "",
    email: "",
    licensePlate: "",
    notes: ""
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
    headers
  });

  const payload = await parseJson<T | ApiError>(response);

  if (!response.ok) {
    throw payload;
  }

  return payload as T;
}

function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("AuthContext missing");
  }

  return context;
}

function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetchJson<{ authenticated: boolean; user?: User }>("/api/auth/me", {
        method: "GET",
        headers: {}
      });

      setUser(response.authenticated ? response.user ?? null : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetchJson<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({})
    });
    setUser(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      refresh,
      setUser,
      logout
    }),
    [loading, logout, refresh, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function LoadingScreen() {
  return (
    <div className="shell">
      <div className="panel">Lade Anwendung...</div>
    </div>
  );
}

function AppLayout({ children }: PropsWithChildren) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Interne Besucherverwaltung</p>
          <h1>Besucher Manager</h1>
        </div>

        <div className="topbar-actions">
          <nav className="nav-links">
            <Link to="/">Voranmeldung</Link>
            {user ? <Link to="/wache">Wache</Link> : null}
            {user?.role === "admin" ? <Link to="/admin">Admin</Link> : null}
            {!user ? <Link to="/login">Login</Link> : null}
          </nav>
          {user ? (
            <button className="secondary-button" type="button" onClick={handleLogout}>
              Abmelden
            </button>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}

function RequireAuth({ children }: PropsWithChildren) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

function RequireAdmin({ children }: PropsWithChildren) {
  const { loading, user } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/wache" replace />;
  }

  return <>{children}</>;
}

function PublicPreRegistrationPage() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [loadingGates, setLoadingGates] = useState(true);
  const [gateError, setGateError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => buildInitialFormState());
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    async function loadGates() {
      setLoadingGates(true);
      setGateError(null);

      try {
        const payload = await fetchJson<{ gates: Gate[]; csrfToken: string }>("/api/public/gates", {
          method: "GET",
          headers: {}
        });

        setGates(payload.gates);
        setCsrfToken(payload.csrfToken);
        setForm((current) => ({
          ...current,
          gateId: current.gateId || payload.gates[0]?.id || ""
        }));
      } catch (error) {
        const apiError = error as ApiError;
        setGateError(
          apiError.error === "DATABASE_SCHEMA_MISSING"
            ? "Die Wachen konnten nicht geladen werden. Bitte Datenbankschema/Migrationen pruefen."
            : "Die Wachen konnten nicht geladen werden. Bitte Datenbankschema/Migrationen pruefen."
        );
      } finally {
        setLoadingGates(false);
      }
    }

    void loadGates();
  }, []);

  const selectedGate = useMemo(
    () => gates.find((gate) => gate.id === form.gateId) ?? null,
    [form.gateId, gates]
  );

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitState({ kind: "idle" });

    try {
      const payload = await fetchJson<{ message: string }>("/api/public/pre-registrations", {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({
          ...form,
          validFrom: new Date(form.validFrom).toISOString(),
          validUntil: new Date(form.validUntil).toISOString()
        })
      });

      setSubmitState({
        kind: "success",
        message: payload.message || "Voranmeldung wurde erfolgreich gespeichert."
      });
      setForm((current) => ({
        ...buildInitialFormState(),
        gateId: current.gateId
      }));
    } catch (error) {
      const apiError = error as ApiError;
      setSubmitState({
        kind: "error",
        message:
          apiError.error === "csrf_failed"
            ? "Die Sitzung fuer das Formular ist abgelaufen. Bitte Seite neu laden."
            : apiError.message || "Die Voranmeldung konnte nicht gespeichert werden."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <main className="layout">
        <section className="panel">
          <div className="section-header">
            <div>
              <h2>Voranmeldung Besucher</h2>
              <p className="section-copy">Die zustaendige Wache sieht den Eintrag sofort in der Tagesuebersicht.</p>
            </div>
          </div>

          <form className="pre-registration-form" onSubmit={handleSubmit}>
            <div className="form-section">
              <h3>Besucher</h3>
              <div className="form-grid two-columns">
                <label>
                  Vorname
                  <input required value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} />
                </label>
                <label>
                  Nachname
                  <input required value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} />
                </label>
                <label>
                  Firma / Organisation
                  <input required value={form.company} onChange={(event) => updateField("company", event.target.value)} />
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
              </div>
            </div>

            <div className="form-section">
              <h3>Besuch</h3>
              <div className="form-grid two-columns">
                <label>
                  Ansprechpartner
                  <input required value={form.hostName} onChange={(event) => updateField("hostName", event.target.value)} />
                </label>
                <label>
                  Abteilung / Bereich
                  <input
                    required
                    value={form.hostDepartment}
                    onChange={(event) => updateField("hostDepartment", event.target.value)}
                  />
                </label>
                <label>
                  Besuchszweck
                  <input required value={form.purpose} onChange={(event) => updateField("purpose", event.target.value)} />
                </label>
                <label>
                  Zustaendige Wache
                  <select
                    required
                    value={form.gateId}
                    onChange={(event) => updateField("gateId", event.target.value)}
                    disabled={loadingGates || gates.length === 0}
                  >
                    {loadingGates ? <option>Wachen werden geladen...</option> : null}
                    {!loadingGates && !gateError && gates.length === 0 ? <option>Keine aktiven Wachen konfiguriert</option> : null}
                    {gates.map((gate) => (
                      <option key={gate.id} value={gate.id}>
                        {gate.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Gueltig von
                  <input
                    required
                    type="datetime-local"
                    value={form.validFrom}
                    onChange={(event) => updateField("validFrom", event.target.value)}
                  />
                </label>
                <label>
                  Gueltig bis
                  <input
                    required
                    type="datetime-local"
                    value={form.validUntil}
                    onChange={(event) => updateField("validUntil", event.target.value)}
                  />
                </label>
              </div>
              <label>
                Bemerkung
                <textarea rows={4} value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={isSubmitting || loadingGates || gates.length === 0 || !csrfToken}>
                {isSubmitting ? "Speichert..." : "Voranmeldung senden"}
              </button>
              <p className="inline-note">Es wird kein Benutzerkonto benoetigt. Zeitpunkt und IP-Adresse werden serverseitig protokolliert.</p>
            </div>

            {submitState.kind === "success" ? <div className="feedback success">{submitState.message}</div> : null}
            {submitState.kind === "error" ? <div className="feedback error">{submitState.message}</div> : null}
            {gateError ? <div className="feedback error">{gateError}</div> : null}
            {!loadingGates && !gateError && gates.length === 0 ? (
              <div className="feedback info">Keine aktiven Wachen konfiguriert.</div>
            ) : null}
          </form>
        </section>

        <aside className="panel side-panel">
          <h2>Aktuelle Auswahl</h2>
          <dl className="details-list">
            <div>
              <dt>Wache</dt>
              <dd>{selectedGate?.name ?? "Noch nicht gewaehlt"}</dd>
            </div>
            <div>
              <dt>Standort</dt>
              <dd>{selectedGate?.location || "Keine Angabe"}</dd>
            </div>
            <div>
              <dt>Hinweis</dt>
              <dd>{selectedGate?.description || "Keine Zusatzbeschreibung hinterlegt."}</dd>
            </div>
          </dl>
        </aside>
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
      navigate(user.role === "admin" ? "/admin" : "/wache", { replace: true });
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [checkoutState, setCheckoutState] = useState<Record<string, CheckoutFormState>>({});

  const loadVisits = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);

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
  }, [search, statusFilter]);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);

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
    const current = checkoutState[visitId] ?? { signed: false, note: "" };

    try {
      await fetchJson<{ success: boolean }>("/api/guard/visits/" + visitId + "/check-out", {
        method: "POST",
        body: JSON.stringify({
          signed_by_host_confirmed: current.signed,
          checkout_note: current.note
        })
      });
      setActionMessage("Besuch wurde ausgecheckt.");
      setCheckoutState((existing) => ({ ...existing, [visitId]: { signed: false, note: "" } }));
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
        signed: existing[visitId]?.signed ?? false,
        note: existing[visitId]?.note ?? "",
        ...next
      }
    }));
  }

  return (
    <AppLayout>
      <main className="panel page-panel">
        <div className="section-header">
          <div>
            <h2>Wache Tagesuebersicht</h2>
            <p className="section-copy">Heutige Besuche, Suche, Statusfilter und Aktionen.</p>
          </div>
        </div>

        <div className="toolbar">
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
          </select>
        </div>

        {actionMessage ? <div className="feedback info">{actionMessage}</div> : null}
        {error ? <div className="feedback error">{error}</div> : null}
        {loading ? <div className="feedback info">Besuche werden geladen...</div> : null}

        {!loading ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Uhrzeit</th>
                  <th>Besucher</th>
                  <th>Firma</th>
                  <th>Ansprechpartner</th>
                  <th>Abteilung</th>
                  <th>Besuchszweck</th>
                  <th>Gueltig bis</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => {
                  const checkoutForm = checkoutState[visit.id] ?? { signed: false, note: "" };
                  const visitTime = visit.checkInAt || visit.validFrom;

                  return (
                    <tr key={visit.id}>
                      <td>
                        <span className={statusClassName(visit.status)}>{formatStatus(visit.status)}</span>
                      </td>
                      <td>{formatDateTime(visitTime)}</td>
                      <td>{visit.firstName} {visit.lastName}</td>
                      <td>{visit.company}</td>
                      <td>{visit.hostName}</td>
                      <td>{visit.hostDepartment}</td>
                      <td>{visit.purpose}</td>
                      <td>{formatDateTime(visit.validUntil)}</td>
                      <td>
                        <div className="row-actions">
                          {visit.status === "pre_registered" ? (
                            <button type="button" onClick={() => void handleCheckIn(visit.id)}>
                              Einchecken
                            </button>
                          ) : null}

                          {visit.status === "checked_in" || visit.status === "checked_out" ? (
                            <Link className="button-link" to={`/wache/besuche/${visit.id}/druck`}>
                              Besucherschein drucken
                            </Link>
                          ) : null}

                          {visit.status === "checked_in" ? (
                            <div className="checkout-box">
                              <label className="checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={checkoutForm.signed}
                                  onChange={(event) => updateCheckoutState(visit.id, { signed: event.target.checked })}
                                />
                                Besucherschein wurde unterschrieben
                              </label>
                              <input
                                placeholder="Bemerkung zur Ausfahrt"
                                value={checkoutForm.note}
                                onChange={(event) => updateCheckoutState(visit.id, { note: event.target.value })}
                              />
                              <button type="button" disabled={!checkoutForm.signed} onClick={() => void handleCheckOut(visit.id)}>
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
                    <td colSpan={9}>Keine Besuche fuer die aktuelle Auswahl gefunden.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
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

  return (
    <AppLayout>
      <main className="panel print-panel">
        {loading ? <div className="feedback info">Druckansicht wird geladen...</div> : null}
        {error ? <div className="feedback error">{error}</div> : null}

        {visit ? (
          <div className="print-layout">
            <div className="print-toolbar no-print">
              <button type="button" onClick={handlePrint}>Drucken</button>
              <Link className="button-link" to="/wache">Zurueck zur Wache</Link>
            </div>

            <div className="badge-sheet">
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
                <div><span>Firma / Organisation</span><strong>{visit.company}</strong></div>
                <div><span>Ansprechpartner</span><strong>{visit.hostName}</strong></div>
                <div><span>Abteilung / Bereich</span><strong>{visit.hostDepartment}</strong></div>
                <div><span>Besuchszweck</span><strong>{visit.purpose}</strong></div>
                <div><span>Wache / Eingang</span><strong>{visit.gateName}</strong></div>
                <div><span>Gueltig von</span><strong>{formatDateTime(visit.validFrom)}</strong></div>
                <div><span>Gueltig bis</span><strong>{formatDateTime(visit.validUntil)}</strong></div>
              </section>

              <section className="print-columns">
                <div className="print-block">
                  <h3>Sicherheitshinweise</h3>
                  {visit.badgeTexts.length ? (
                    <ul className="text-list">
                      {visit.badgeTexts.map((text) => (
                        <li key={text.id}>
                          <strong>{text.name}:</strong> {text.content}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="text-list">
                      <li>Fotografieren nur mit ausdruecklicher Freigabe.</li>
                      <li>Bitte sichtbar tragen und beim Verlassen an der Pforte abmelden.</li>
                      <li>Vor Ausfahrt / Verlassen des Gelaendes durch den Ansprechpartner zu unterschreiben.</li>
                    </ul>
                  )}
                </div>

                <div className="print-block">
                  <h3>Gelaendeplan</h3>
                  {visit.siteMap ? (
                    <img className="site-map" src={visit.siteMap.filePath} alt={visit.siteMap.name} />
                  ) : (
                    <div className="site-map placeholder-map">Kein aktiver Gelaendeplan hinterlegt.</div>
                  )}
                </div>
              </section>

              <section className="signature-section">
                <div className="signature-line" />
                <p>Vor Ausfahrt / Verlassen des Gelaendes durch den Ansprechpartner zu unterschreiben.</p>
              </section>
            </div>
          </div>
        ) : null}
      </main>
    </AppLayout>
  );
}

function AdminPage() {
  const [stats, setStats] = useState<{ users: number; gates: number; templates: number } | null>(null);

  useEffect(() => {
    async function load() {
      const payload = await fetchJson<{ users: number; gates: number; templates: number }>("/api/admin/bootstrap", {
        method: "GET",
        headers: {}
      });
      setStats(payload);
    }

    void load();
  }, []);

  return (
    <AppLayout>
      <main className="panel page-panel">
        <div className="section-header">
          <div>
            <h2>Admin</h2>
            <p className="section-copy">Grundseite fuer Wachen, Benutzer, Texte, Gelaendeplan und Systemstatus.</p>
          </div>
        </div>

        <div className="card-grid">
          <article className="panel mini-card"><h3>Wachen verwalten</h3><p>{stats ? `${stats.gates} Wachen vorhanden` : "Lade..."}</p></article>
          <article className="panel mini-card"><h3>Benutzer verwalten</h3><p>{stats ? `${stats.users} Benutzer vorhanden` : "Lade..."}</p></article>
          <article className="panel mini-card"><h3>Hinweis-Texte verwalten</h3><p>{stats ? `${stats.templates} aktive Texte vorhanden` : "Lade..."}</p></article>
          <article className="panel mini-card"><h3>Gelaendeplan verwalten</h3><p>Upload- und Aktivierungsfunktion folgt.</p></article>
          <article className="panel mini-card"><h3>Systemstatus</h3><p>Docker-Only Betrieb, externer MSSQL, Port 3020.</p></article>
        </div>
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
          <RequireAuth>
            <GuardDashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/wache/besuche/:id/druck"
        element={
          <RequireAuth>
            <PrintViewPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminPage />
          </RequireAdmin>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
