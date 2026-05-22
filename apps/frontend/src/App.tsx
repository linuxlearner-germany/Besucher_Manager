import {
  type ChangeEvent,
  createContext,
  type DragEvent,
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
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams
} from "react-router-dom";
import { Alert, Card, DataTable, FormField } from "./components/ui";

type User = {
  id: string;
  username: string;
  role: "admin" | "guard" | "sibe";
  gateId: string | null;
};

type Gate = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
};
type AdminGate = Gate & { isActive: boolean; sortOrder: number };
type AdminUser = { id: string; username: string; role: "admin" | "guard" | "sibe"; gateId: string | null; isActive: boolean; lastLoginAt?: string | null };
type EditableAdminUser = AdminUser & { password?: string };
type AdminBadgeText = {
  id: string;
  name: string;
  textType: "security_notice" | "photo_ban" | "signature_notice" | "footer";
  content: string;
  isActive: boolean;
};
type AdminAuditLog = {
  id: string;
  user: string;
  action: string;
  objectType: string;
  objectId: string;
  ipAddress: string | null;
  timestamp: string;
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
  birthDate: string | null;
  visitorPhone: string | null;
  visitorEmail: string | null;
  hostName: string;
  hostEmail: string | null;
  hostPhone: string | null;
  hostDepartment: string;
  purpose: string;
  gateId: string;
  gateName: string;
  licensePlate: string | null;
  signedByHostConfirmed: boolean;
  hostSignatureStatus: "not_required" | "pending" | "signed_same_day" | "signed_later" | "missing_exception";
  hostSignatureDate: string | null;
  hostSignatureNote: string | null;
  hostSignatureConfirmedBy: string | null;
  hostSignatureConfirmedAt: string | null;
  checkoutNote: string | null;
  badgeNumber: string | null;
};

type VisitDetail = VisitRow & {
  notes: string | null;
  badgeNumber: string | null;
  siteMap: { id: string; name: string; filePath: string } | null;
  badgeTexts: Array<{ id: string; name: string; textType: string; content: string }>;
};
type SibeVisitDetail = Omit<VisitDetail, "siteMap" | "badgeTexts">;

type FormState = {
  firstName: string;
  lastName: string;
  company: string;
  birthDate: string;
  hostName: string;
  hostEmail: string;
  hostPhone: string;
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

type FieldErrorState = Partial<Record<keyof FormState, string>>;

type CheckoutFormState = {
  signatureStatus: "signed_same_day" | "signed_later" | "not_required" | "missing_exception";
  signatureDate: string;
  signatureNote: string;
  checkoutNote: string;
};

type GuardVisitEditState = {
  firstName: string;
  lastName: string;
  birthDate: string;
  company: string;
  phone: string;
  email: string;
  licensePlate: string;
  hostName: string;
  hostEmail: string;
  hostPhone: string;
  hostDepartment: string;
  purpose: string;
  gateId: string;
  validFrom: string;
  validUntil: string;
  notes: string;
};

type SiteMapSummary = {
  id: string;
  name: string;
  filePath: string;
  originalFileName: string | null;
  storedFileName: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  uploadedBy: string | null;
} | null;

type SibeSummary = {
  visitorsTotal: number;
  activeVisitors: number;
  todaysVisits: number;
  checkedInVisitors: number;
  usersTotal: number;
  activeUsers: number;
};

type SibeVisitRow = {
  id: string;
  visitorId: string;
  visitorName: string;
  company: string;
  licensePlate: string | null;
  badgeNumber: string | null;
  status: string;
  gateName: string;
  hostName: string;
  hostDepartment: string;
  validFrom: string;
  validUntil: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  hostSignatureStatus: string;
};

type SibeVisitorRow = {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  archivedAt: string | null;
  visitCount: number;
  lastVisitAt: string | null;
};

type SibeUserRow = {
  id: string;
  username: string;
  role: "admin" | "guard" | "sibe";
  gateName: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ThemeContext = createContext<{ mode: "light" | "dark"; toggle: () => void } | null>(null);
const BRANDING = {
  logo: "/branding/wiweb-logo-kurz-blau_neu.png",
  icon: "/branding/WIWEB-waage-vektor_ohne_schrift.png",
  background: "/branding/background.png"
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDateOnly(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium"
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
    case "cancelled":
      return "Storniert";
    default:
      return status;
  }
}

function formatSignatureStatus(status: VisitRow["hostSignatureStatus"] | string): string {
  switch (status) {
    case "pending":
      return "Offen";
    case "signed_same_day":
      return "Unterschrift liegt vor";
    case "signed_later":
      return "Wird nachgereicht";
    case "missing_exception":
      return "Fehlt mit Ausnahme";
    case "not_required":
      return "Nicht erforderlich";
    default:
      return status;
  }
}

function formatFileSize(value: number | null | undefined): string {
  if (!value || value < 0) {
    return "-";
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusClassName(status: string): string {
  switch (status) {
    case "pre_registered":
      return "badge status-pending";
    case "checked_in":
      return "badge status-active";
    case "checked_out":
      return "badge status-done";
    case "cancelled":
      return "badge status-cancelled";
    default:
      return "badge";
  }
}

function formatTextType(textType: AdminBadgeText["textType"]): string {
  switch (textType) {
    case "security_notice":
      return "Sicherheitshinweis";
    case "photo_ban":
      return "Fotografierverbot";
    case "signature_notice":
      return "Unterschrift";
    case "footer":
      return "Footer";
    default:
      return textType;
  }
}

function extractFieldErrors(error: ApiError): Record<string, string> {
  const details = error.details as { fieldErrors?: Record<string, string[]> } | undefined;
  const nextFieldErrors: Record<string, string> = {};

  if (!details?.fieldErrors) {
    return nextFieldErrors;
  }

  for (const [key, value] of Object.entries(details.fieldErrors)) {
    if (Array.isArray(value) && value.length > 0) {
      nextFieldErrors[key] = value[0];
    }
  }

  return nextFieldErrors;
}

function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toDateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function buildInitialFormState(): FormState {
  const validFrom = new Date();
  const validUntil = new Date(validFrom.getTime() + 2 * 60 * 60 * 1000);

  return {
    firstName: "",
    lastName: "",
    company: "",
    birthDate: "",
    hostName: "",
    hostEmail: "",
    hostPhone: "",
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

function buildInitialCheckoutState(): CheckoutFormState {
  return {
    signatureStatus: "signed_same_day",
    signatureDate: toDateInputValue(new Date()),
    signatureNote: "",
    checkoutNote: ""
  };
}

function buildGuardVisitEditState(visit: VisitDetail): GuardVisitEditState {
  return {
    firstName: visit.firstName,
    lastName: visit.lastName,
    birthDate: visit.birthDate || "",
    company: visit.company,
    phone: visit.visitorPhone || "",
    email: visit.visitorEmail || "",
    licensePlate: visit.licensePlate || "",
    hostName: visit.hostName,
    hostEmail: visit.hostEmail || "",
    hostPhone: visit.hostPhone || "",
    hostDepartment: visit.hostDepartment,
    purpose: visit.purpose,
    gateId: visit.gateId,
    validFrom: toLocalInputValue(new Date(visit.validFrom)),
    validUntil: toLocalInputValue(new Date(visit.validUntil)),
    notes: visit.notes || ""
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type") && !(init?.body instanceof FormData)) {
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

function useThemeMode() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("ThemeContext missing");
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
      <div className="content-container loading-shell">
        <div className="loading-card">
          <img className="loading-logo" src={BRANDING.logo} alt="WIWeB" />
          <div className="loading-spinner" aria-hidden="true" />
          <div className="loading-copy">
            <h2>Besucher Manager</h2>
            <p>Anwendung wird geladen ...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppLayout({ children }: PropsWithChildren) {
  const { user, logout } = useAuth();
  const { mode, toggle } = useThemeMode();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="shell">
      <div className="content-container">
      <header className="topbar">
        <div className="brand-wrap">
          <img className="brand-logo" src={BRANDING.logo} alt="WIWeB" />
        </div>

        <div className="title-wrap">
          <p className="eyebrow">Interne Besucherverwaltung</p>
          <h1>Besucher Manager</h1>
        </div>

        <div className="topbar-actions">
          <nav className="nav-links">
            <NavLink to="/" className={({ isActive }) => (isActive ? "active-link" : "")}>Voranmeldung</NavLink>
            {user && (user.role === "guard" || user.role === "admin") ? <NavLink to="/wache" className={({ isActive }) => (isActive ? "active-link" : "")}>Wache</NavLink> : null}
            {user?.role === "admin" ? <NavLink to="/admin" className={({ isActive }) => (isActive ? "active-link" : "")}>Admin</NavLink> : null}
            {user && (user.role === "sibe" || user.role === "admin") ? <NavLink to="/sibe" className={({ isActive }) => (isActive ? "active-link" : "")}>SiBe</NavLink> : null}
            {!user ? <NavLink to="/login" className={({ isActive }) => (isActive ? "active-link" : "")}>Login</NavLink> : null}
          </nav>
          <button className="secondary-button" type="button" onClick={toggle}>
            {mode === "dark" ? "Light" : "Dark"}
          </button>
          {user ? (
            <button className="secondary-button" type="button" onClick={handleLogout}>
              Abmelden
            </button>
          ) : null}
        </div>
      </header>
      {children}
      </div>
    </div>
  );
}

function RequireRoles({
  children,
  allowedRoles,
  redirectTo = "/login"
}: PropsWithChildren<{ allowedRoles: User["role"][]; redirectTo?: string }>) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

function PublicPreRegistrationPage() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [loadingGates, setLoadingGates] = useState(true);
  const [gateError, setGateError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => buildInitialFormState());
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrorState>({});
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
          validFrom: new Date(form.validFrom).toISOString(),
          validUntil: new Date(form.validUntil).toISOString()
        })
      });

      setSubmitState({
        kind: "success",
        message: payload.message || "Voranmeldung wurde erfolgreich gespeichert."
      });
      setForm((current) => ({ ...buildInitialFormState(), gateId: current.gateId }));
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
      <main className="panel page-panel">
        <section>
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
              </div>
            </div>

            <div className="form-section">
              <h3>Besuch</h3>
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
                  Ansprechpartner Telefon
                  <input value={form.hostPhone} onChange={(event) => updateField("hostPhone", event.target.value)} />
                </label>
                <label>
                  Abteilung / Bereich *
                  <input
                    required
                    value={form.hostDepartment}
                    onChange={(event) => updateField("hostDepartment", event.target.value)}
                  />
                  {fieldErrors.hostDepartment ? <span className="field-error">{fieldErrors.hostDepartment}</span> : null}
                </label>
                <label>
                  Besuchszweck *
                  <input required value={form.purpose} onChange={(event) => updateField("purpose", event.target.value)} />
                  {fieldErrors.purpose ? <span className="field-error">{fieldErrors.purpose}</span> : null}
                </label>
                <label>
                  Zustaendige Wache *
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
                  {fieldErrors.gateId ? <span className="field-error">{fieldErrors.gateId}</span> : null}
                </label>
                <label>
                  Gueltig von *
                  <input
                    required
                    type="datetime-local"
                    value={form.validFrom}
                    onChange={(event) => updateField("validFrom", event.target.value)}
                  />
                  {fieldErrors.validFrom ? <span className="field-error">{fieldErrors.validFrom}</span> : null}
                </label>
                <label>
                  Gueltig bis *
                  <input
                    required
                    type="datetime-local"
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [checkoutState, setCheckoutState] = useState<Record<string, CheckoutFormState>>({});
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
    const current = checkoutState[visitId] ?? buildInitialCheckoutState();

    try {
      await fetchJson<{ success: boolean }>("/api/guard/visits/" + visitId + "/check-out", {
        method: "POST",
        body: JSON.stringify({
          host_signature_status: current.signatureStatus,
          host_signature_date: current.signatureStatus === "signed_later" ? current.signatureDate : undefined,
          host_signature_note: current.signatureStatus === "missing_exception" || current.signatureStatus === "not_required" || current.signatureStatus === "signed_later"
            ? current.signatureNote
            : undefined,
          checkout_note: current.checkoutNote
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
            <option value="cancelled">Storniert</option>
          </select>
        </div>

        <div className="card-grid">
          <article className="panel mini-card"><h3>Vorangemeldet heute</h3><p>{stats.preRegistered}</p></article>
          <article className="panel mini-card"><h3>Aktuell eingecheckt</h3><p>{stats.checkedIn}</p></article>
          <article className="panel mini-card"><h3>Ausgecheckt heute</h3><p>{stats.checkedOut}</p></article>
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
                  const checkoutForm = checkoutState[visit.id] ?? buildInitialCheckoutState();
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
                              <select
                                value={checkoutForm.signatureStatus}
                                onChange={(event) => updateCheckoutState(visit.id, { signatureStatus: event.target.value as CheckoutFormState["signatureStatus"] })}
                              >
                                <option value="signed_same_day">Unterschrift liegt vor</option>
                                <option value="signed_later">Unterschrift wird nachgereicht</option>
                                <option value="not_required">Unterschrift nicht erforderlich</option>
                                <option value="missing_exception">Unterschrift fehlt, Ausnahme dokumentieren</option>
                              </select>
                              {checkoutForm.signatureStatus === "signed_later" ? (
                                <input
                                  type="date"
                                  value={checkoutForm.signatureDate}
                                  onChange={(event) => updateCheckoutState(visit.id, { signatureDate: event.target.value })}
                                />
                              ) : null}
                              <input
                                placeholder={checkoutForm.signatureStatus === "missing_exception" ? "Ausnahme begruenden" : "Hinweis zur Unterschrift (optional)"}
                                value={checkoutForm.signatureNote}
                                onChange={(event) => updateCheckoutState(visit.id, { signatureNote: event.target.value })}
                              />
                              <input
                                placeholder="Bemerkung zur Ausfahrt"
                                value={checkoutForm.checkoutNote}
                                onChange={(event) => updateCheckoutState(visit.id, { checkoutNote: event.target.value })}
                              />
                              <button
                                type="button"
                                disabled={
                                  (checkoutForm.signatureStatus === "signed_later" && !checkoutForm.signatureDate)
                                  || (checkoutForm.signatureStatus === "missing_exception" && !checkoutForm.signatureNote.trim())
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

function VisitDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<GuardVisitEditState | null>(null);
  const [checkoutState, setCheckoutState] = useState<CheckoutFormState>(() => buildInitialCheckoutState());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadVisit = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJson<{ visit: VisitDetail }>(`/api/guard/visits/${id}`, {
        method: "GET",
        headers: {}
      });
      setVisit(payload.visit);
      setEditForm(buildGuardVisitEditState(payload.visit));
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Besuch konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadVisit();
  }, [loadVisit]);

  async function handleCheckIn() {
    if (!id) return;
    try {
      setError(null);
      await fetchJson(`/api/guard/visits/${id}/check-in`, { method: "POST", body: JSON.stringify({}) });
      setMessage("Besuch wurde eingecheckt.");
      await loadVisit();
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Check-in fehlgeschlagen.");
    }
  }

  async function handleCheckOut() {
    if (!id) return;
    try {
      setError(null);
      await fetchJson(`/api/guard/visits/${id}/check-out`, {
        method: "POST",
        body: JSON.stringify({
          host_signature_status: checkoutState.signatureStatus,
          host_signature_date: checkoutState.signatureStatus === "signed_later" ? checkoutState.signatureDate : undefined,
          host_signature_note:
            checkoutState.signatureStatus === "missing_exception"
            || checkoutState.signatureStatus === "not_required"
            || checkoutState.signatureStatus === "signed_later"
              ? checkoutState.signatureNote
              : undefined,
          checkout_note: checkoutState.checkoutNote
        })
      });
      setMessage("Besuch wurde ausgecheckt.");
      setCheckoutState(buildInitialCheckoutState());
      await loadVisit();
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Check-out fehlgeschlagen.");
    }
  }

  async function handleSaveVisit() {
    if (!id || !editForm) return;
    setFieldErrors({});
    setError(null);
    try {
      await fetchJson(`/api/guard/visits/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editForm,
          birthDate: editForm.birthDate || "",
          validFrom: new Date(editForm.validFrom).toISOString(),
          validUntil: new Date(editForm.validUntil).toISOString()
        })
      });
      setMessage("Besuchsdaten wurden gespeichert.");
      setIsEditing(false);
      await loadVisit();
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setFieldErrors(extractFieldErrors(errorPayload));
      setError(errorPayload.message || "Besuchsdaten konnten nicht gespeichert werden.");
    }
  }

  return (
    <AppLayout>
      <main className="panel page-panel">
        <div className="section-header">
          <div>
            <h2>Besucherdetails</h2>
            <p className="section-copy">Detailansicht mit allen relevanten Besuchsdaten und Aktionen.</p>
          </div>
        </div>

        {message ? <div className="feedback success">{message}</div> : null}
        {error ? <div className="feedback error">{error}</div> : null}
        {loading ? <div className="feedback info">Daten werden geladen...</div> : null}

        {visit ? (
          <>
            {isEditing && editForm ? (
              <div className="form-section">
                <h3>Daten bearbeiten</h3>
                <div className="form-grid two-columns">
                  <FormField label="Vorname" required error={fieldErrors.firstName}><input value={editForm.firstName} onChange={(event) => setEditForm((current) => current ? { ...current, firstName: event.target.value } : current)} /></FormField>
                  <FormField label="Nachname" required error={fieldErrors.lastName}><input value={editForm.lastName} onChange={(event) => setEditForm((current) => current ? { ...current, lastName: event.target.value } : current)} /></FormField>
                  <FormField label="Geburtsdatum" error={fieldErrors.birthDate}><input type="date" value={editForm.birthDate} onChange={(event) => setEditForm((current) => current ? { ...current, birthDate: event.target.value } : current)} /></FormField>
                  <FormField label="Firma / Organisation" required error={fieldErrors.company}><input value={editForm.company} onChange={(event) => setEditForm((current) => current ? { ...current, company: event.target.value } : current)} /></FormField>
                  <FormField label="Telefon" error={fieldErrors.phone}><input value={editForm.phone} onChange={(event) => setEditForm((current) => current ? { ...current, phone: event.target.value } : current)} /></FormField>
                  <FormField label="E-Mail" error={fieldErrors.email}><input value={editForm.email} onChange={(event) => setEditForm((current) => current ? { ...current, email: event.target.value } : current)} /></FormField>
                  <FormField label="Kennzeichen" error={fieldErrors.licensePlate}><input value={editForm.licensePlate} onChange={(event) => setEditForm((current) => current ? { ...current, licensePlate: event.target.value } : current)} /></FormField>
                  <FormField label="Ansprechpartner" required error={fieldErrors.hostName}><input value={editForm.hostName} onChange={(event) => setEditForm((current) => current ? { ...current, hostName: event.target.value } : current)} /></FormField>
                  <FormField label="Ansprechpartner E-Mail" error={fieldErrors.hostEmail}><input value={editForm.hostEmail} onChange={(event) => setEditForm((current) => current ? { ...current, hostEmail: event.target.value } : current)} /></FormField>
                  <FormField label="Ansprechpartner Telefon" error={fieldErrors.hostPhone}><input value={editForm.hostPhone} onChange={(event) => setEditForm((current) => current ? { ...current, hostPhone: event.target.value } : current)} /></FormField>
                  <FormField label="Abteilung / Bereich" required error={fieldErrors.hostDepartment}><input value={editForm.hostDepartment} onChange={(event) => setEditForm((current) => current ? { ...current, hostDepartment: event.target.value } : current)} /></FormField>
                  <FormField label="Besuchszweck" required error={fieldErrors.purpose}><input value={editForm.purpose} onChange={(event) => setEditForm((current) => current ? { ...current, purpose: event.target.value } : current)} /></FormField>
                  <FormField label="Gueltig von" required error={fieldErrors.validFrom}><input type="datetime-local" value={editForm.validFrom} onChange={(event) => setEditForm((current) => current ? { ...current, validFrom: event.target.value } : current)} /></FormField>
                  <FormField label="Gueltig bis" required error={fieldErrors.validUntil}><input type="datetime-local" value={editForm.validUntil} onChange={(event) => setEditForm((current) => current ? { ...current, validUntil: event.target.value } : current)} /></FormField>
                </div>
                <FormField label="Bemerkung" error={fieldErrors.notes}><textarea rows={4} value={editForm.notes} onChange={(event) => setEditForm((current) => current ? { ...current, notes: event.target.value } : current)} /></FormField>
              </div>
            ) : (
              <dl className="details-list">
                <div><dt>Besuchsnummer</dt><dd>{visit.badgeNumber || visit.id.slice(0, 8).toUpperCase()}</dd></div>
                <div><dt>Status</dt><dd>{formatStatus(visit.status)}</dd></div>
                <div><dt>Besuchername</dt><dd>{visit.firstName} {visit.lastName}</dd></div>
                <div><dt>Geburtsdatum</dt><dd>{formatDateOnly(visit.birthDate)}</dd></div>
                <div><dt>Firma</dt><dd>{visit.company}</dd></div>
                <div><dt>Telefon</dt><dd>{visit.visitorPhone || "-"}</dd></div>
                <div><dt>E-Mail</dt><dd>{visit.visitorEmail || "-"}</dd></div>
                <div><dt>Kennzeichen</dt><dd>{visit.licensePlate || "-"}</dd></div>
                <div><dt>Ansprechpartner</dt><dd>{visit.hostName}</dd></div>
                <div><dt>Ansprechpartner E-Mail</dt><dd>{visit.hostEmail || "-"}</dd></div>
                <div><dt>Ansprechpartner Telefon</dt><dd>{visit.hostPhone || "-"}</dd></div>
                <div><dt>Abteilung / Bereich</dt><dd>{visit.hostDepartment}</dd></div>
                <div><dt>Besuchszweck</dt><dd>{visit.purpose}</dd></div>
                <div><dt>Wache</dt><dd>{visit.gateName}</dd></div>
                <div><dt>Gueltig von</dt><dd>{formatDateTime(visit.validFrom)}</dd></div>
                <div><dt>Gueltig bis</dt><dd>{formatDateTime(visit.validUntil)}</dd></div>
                <div><dt>Check-in-Zeit</dt><dd>{formatDateTime(visit.checkInAt)}</dd></div>
                <div><dt>Check-out-Zeit</dt><dd>{formatDateTime(visit.checkOutAt)}</dd></div>
                <div><dt>Bemerkung</dt><dd>{visit.notes || "-"}</dd></div>
                <div><dt>Ausfahrt-Bemerkung</dt><dd>{visit.checkoutNote || "-"}</dd></div>
                <div><dt>Unterschriftsstatus</dt><dd>{formatSignatureStatus(visit.hostSignatureStatus)}</dd></div>
                <div><dt>Unterschriftsdatum</dt><dd>{formatDateOnly(visit.hostSignatureDate)}</dd></div>
                <div><dt>Bestaetigt durch</dt><dd>{visit.hostSignatureConfirmedBy || "-"}</dd></div>
                <div><dt>Bestaetigt am</dt><dd>{formatDateTime(visit.hostSignatureConfirmedAt)}</dd></div>
                <div><dt>Hinweis Unterschrift</dt><dd>{visit.hostSignatureNote || "-"}</dd></div>
              </dl>
            )}

            <div className="row-actions">
              {visit.status === "pre_registered" || visit.status === "checked_in" ? (
                isEditing ? (
                  <>
                    <button type="button" onClick={() => void handleSaveVisit()}>Speichern</button>
                    <button type="button" className="secondary-button" onClick={() => { setIsEditing(false); setEditForm(buildGuardVisitEditState(visit)); setFieldErrors({}); }}>
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setIsEditing(true); setMessage(null); setError(null); }}>
                    Daten bearbeiten
                  </button>
                )
              ) : null}
              {visit.status === "pre_registered" ? (
                <button type="button" onClick={() => void handleCheckIn()}>Einchecken</button>
              ) : null}
              {(visit.status === "pre_registered" || visit.status === "checked_in" || visit.status === "checked_out") ? (
                <Link className="button-link" to={`/wache/besuche/${visit.id}/druck`}>Besucherschein drucken</Link>
              ) : null}
              {visit.status === "checked_in" ? (
                <div className="checkout-box">
                  <select
                    value={checkoutState.signatureStatus}
                    onChange={(event) => setCheckoutState((current) => ({ ...current, signatureStatus: event.target.value as CheckoutFormState["signatureStatus"] }))}
                  >
                    <option value="signed_same_day">Unterschrift liegt vor</option>
                    <option value="signed_later">Unterschrift wird nachgereicht</option>
                    <option value="not_required">Unterschrift nicht erforderlich</option>
                    <option value="missing_exception">Unterschrift fehlt, Ausnahme dokumentieren</option>
                  </select>
                  {checkoutState.signatureStatus === "signed_later" ? (
                    <input type="date" value={checkoutState.signatureDate} onChange={(event) => setCheckoutState((current) => ({ ...current, signatureDate: event.target.value }))} />
                  ) : null}
                  <input
                    placeholder={checkoutState.signatureStatus === "missing_exception" ? "Ausnahme begruenden" : "Hinweis zur Unterschrift (optional)"}
                    value={checkoutState.signatureNote}
                    onChange={(event) => setCheckoutState((current) => ({ ...current, signatureNote: event.target.value }))}
                  />
                  <input
                    placeholder="Bemerkung zur Ausfahrt (optional)"
                    value={checkoutState.checkoutNote}
                    onChange={(event) => setCheckoutState((current) => ({ ...current, checkoutNote: event.target.value }))}
                  />
                  <button
                    type="button"
                    disabled={
                      (checkoutState.signatureStatus === "signed_later" && !checkoutState.signatureDate)
                      || (checkoutState.signatureStatus === "missing_exception" && !checkoutState.signatureNote.trim())
                    }
                    onClick={() => void handleCheckOut()}
                  >
                    Auschecken bestaetigen
                  </button>
                </div>
              ) : null}
              <button type="button" onClick={() => navigate("/wache")}>Zurueck zur Tagesuebersicht</button>
            </div>
          </>
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

  const securityTexts = visit?.badgeTexts.filter((text) => text.textType === "security_notice" || text.textType === "footer") ?? [];
  const photoBanText = visit?.badgeTexts.find((text) => text.textType === "photo_ban")?.content
    || "Fotografieren und Filmen auf dem Gelaende ist verboten.";
  const signatureText = visit?.badgeTexts.find((text) => text.textType === "signature_notice")?.content
    || "Vor Ausfahrt / Verlassen des Gelaendes durch den Ansprechpartner zu unterschreiben.";

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

            <div className="feedback info no-print">
              Wenn der Browser URL, Datum oder Seitenzahl mitdruckt, bitte im Druckdialog die Option fuer Kopf- und Fusszeilen deaktivieren.
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
                <div><span>Geburtsdatum</span><strong>{formatDateOnly(visit.birthDate)}</strong></div>
                <div><span>Firma / Organisation</span><strong>{visit.company}</strong></div>
                <div><span>Ansprechpartner</span><strong>{visit.hostName}</strong></div>
                <div><span>Ansprechpartner Kontakt</span><strong>{visit.hostPhone || visit.hostEmail ? [visit.hostPhone, visit.hostEmail].filter(Boolean).join(" / ") : "-"}</strong></div>
                <div><span>Abteilung / Bereich</span><strong>{visit.hostDepartment}</strong></div>
                <div><span>Besuchszweck</span><strong>{visit.purpose}</strong></div>
                <div><span>Wache / Eingang</span><strong>{visit.gateName}</strong></div>
                <div><span>Gueltig von</span><strong>{formatDateTime(visit.validFrom)}</strong></div>
                <div><span>Gueltig bis</span><strong>{formatDateTime(visit.validUntil)}</strong></div>
              </section>

              <section className="print-columns">
                <div className="print-block">
                  <h3>Sicherheitshinweise</h3>
                  {securityTexts.length ? (
                    <ul className="text-list">
                      {securityTexts.map((text) => (
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

                  <div className="print-callout">
                    <strong>Fotografierverbot</strong>
                    <p>{photoBanText}</p>
                  </div>
                </div>

                <div className="print-block">
                  <h3>Gelaendeplan</h3>
                  {visit.siteMap ? (
                    <img className="site-map" src={visit.siteMap.filePath} alt={visit.siteMap.name} />
                  ) : (
                    <div className="site-map placeholder-map compact-map">Aktuell ist kein aktiver Gelaendeplan hinterlegt.</div>
                  )}
                </div>
              </section>

              <section className="signature-section">
                <h3>Unterschrift Ansprechpartner</h3>
                <div className="signature-box">
                  <div className="signature-line" />
                </div>
                <p><strong>Datum der Unterschrift:</strong> __________________________</p>
                <p>{signatureText}</p>
              </section>
            </div>
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
      <main className="panel page-panel">
        <div className="section-header">
          <div>
            <h2>SiBe Dashboard</h2>
            <p className="section-copy">Recherche und Auswertung fuer Sicherheitsbeauftragte.</p>
          </div>
        </div>

        {error ? <Alert type="error">{error}</Alert> : null}

        <div className="card-grid">
          <article className="panel mini-card"><h3>Besucher gesamt</h3><p>{summary?.visitorsTotal ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Aktive Besucher</h3><p>{summary?.activeVisitors ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Heutige Besuche</h3><p>{summary?.todaysVisits ?? "-"}</p></article>
          <article className="panel mini-card"><h3>Aktuell eingecheckt</h3><p>{summary?.checkedInVisitors ?? "-"}</p></article>
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
  const [status, setStatus] = useState("all");

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const visitParams = new URLSearchParams();
      if (search) visitParams.set("search", search);
      if (status) visitParams.set("status", status);

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
  }, [search, status]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <AppLayout>
      <main className="panel page-panel">
        <div className="section-header">
          <div>
            <h2>SiBe Besucher</h2>
            <p className="section-copy">Besucher, Besuche und Historie lesen, filtern und durchsuchen.</p>
          </div>
        </div>

        <div className="toolbar">
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
          </select>
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
                  <td>{formatDateTime(visit.validFrom)}</td>
                  <td>{formatDateTime(visit.validUntil)}</td>
                  <td>{formatDateTime(visit.checkInAt)}</td>
                  <td>{formatDateTime(visit.checkOutAt)}</td>
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
      <main className="panel page-panel">
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
              <div><dt>Ansprechpartner</dt><dd>{visit.hostName}</dd></div>
              <div><dt>Ansprechpartner E-Mail</dt><dd>{visit.hostEmail || "-"}</dd></div>
              <div><dt>Ansprechpartner Telefon</dt><dd>{visit.hostPhone || "-"}</dd></div>
              <div><dt>Abteilung / Bereich</dt><dd>{visit.hostDepartment}</dd></div>
              <div><dt>Besuchszweck</dt><dd>{visit.purpose}</dd></div>
              <div><dt>Wache</dt><dd>{visit.gateName}</dd></div>
              <div><dt>Gueltig von</dt><dd>{formatDateTime(visit.validFrom)}</dd></div>
              <div><dt>Gueltig bis</dt><dd>{formatDateTime(visit.validUntil)}</dd></div>
              <div><dt>Check-in-Zeit</dt><dd>{formatDateTime(visit.checkInAt)}</dd></div>
              <div><dt>Check-out-Zeit</dt><dd>{formatDateTime(visit.checkOutAt)}</dd></div>
              <div><dt>Bemerkung</dt><dd>{visit.notes || "-"}</dd></div>
              <div><dt>Ausfahrt-Bemerkung</dt><dd>{visit.checkoutNote || "-"}</dd></div>
              <div><dt>Unterschriftsstatus</dt><dd>{formatSignatureStatus(visit.hostSignatureStatus)}</dd></div>
              <div><dt>Unterschriftsdatum</dt><dd>{formatDateOnly(visit.hostSignatureDate)}</dd></div>
              <div><dt>Bestaetigt durch</dt><dd>{visit.hostSignatureConfirmedBy || "-"}</dd></div>
              <div><dt>Bestaetigt am</dt><dd>{formatDateTime(visit.hostSignatureConfirmedAt)}</dd></div>
              <div><dt>Hinweis Unterschrift</dt><dd>{visit.hostSignatureNote || "-"}</dd></div>
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

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (role !== "all") params.set("role", role);
      if (active !== "all") params.set("active", active);
      const payload = await fetchJson<{ users: SibeUserRow[] }>(`/api/sibe/users?${params.toString()}`, { method: "GET", headers: {} });
      setUsers(payload.users);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Benutzer konnten nicht geladen werden.");
    }
  }, [active, role, search]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  return (
    <AppLayout>
      <main className="panel page-panel">
        <div className="section-header">
          <div>
            <h2>SiBe Benutzer</h2>
            <p className="section-copy">Anwendungskonten lesen, filtern und Rollen zuordnen nachvollziehen.</p>
          </div>
        </div>

        <div className="toolbar">
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

function AdminPage() {
  const [activeSection, setActiveSection] = useState<"dashboard" | "wachen" | "benutzer" | "texte" | "karte" | "audit" | "system">("dashboard");
  const [stats, setStats] = useState<{ users: number; gates: number; templates: number } | null>(null);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [texts, setTexts] = useState<AdminBadgeText[]>([]);
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [systemStatus, setSystemStatus] = useState<{
    app: string;
    activeVisits: number;
    activeGates: number;
    openPreRegistrationsToday: number;
    staleVisits: number;
    retentionDays: number | null;
    retentionEnabled: boolean;
  } | null>(null);
  const [activeSiteMap, setActiveSiteMap] = useState<SiteMapSummary>(null);
  const [siteMaps, setSiteMaps] = useState<NonNullable<SiteMapSummary>[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newGate, setNewGate] = useState({ name: "", description: "", location: "" });
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "guard", gateId: "" });
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
  const [retentionDaysInput, setRetentionDaysInput] = useState("90");
  const [editableGates, setEditableGates] = useState<Record<string, AdminGate>>({});
  const [editableUsers, setEditableUsers] = useState<Record<string, EditableAdminUser>>({});
  const [editableTexts, setEditableTexts] = useState<Record<string, AdminBadgeText>>({});

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [bootstrap, gatePayload, userPayload, textPayload, logPayload, statusPayload, siteMapPayload, siteMapsPayload] = await Promise.all([
        fetchJson<{ users: number; gates: number; templates: number }>("/api/admin/bootstrap", { method: "GET", headers: {} }),
        fetchJson<{ gates: AdminGate[] }>("/api/admin/gates", { method: "GET", headers: {} }),
        fetchJson<{ users: AdminUser[] }>("/api/admin/users", { method: "GET", headers: {} }),
        fetchJson<{ texts: AdminBadgeText[] }>("/api/admin/badge-texts", { method: "GET", headers: {} }),
        fetchJson<{ logs: AdminAuditLog[] }>("/api/admin/audit-logs", { method: "GET", headers: {} }),
        fetchJson<{ app: string; activeVisits: number; activeGates: number; openPreRegistrationsToday: number; staleVisits: number; retentionDays: number | null; retentionEnabled: boolean }>("/api/admin/system-status", { method: "GET", headers: {} }),
        fetchJson<{ siteMap: SiteMapSummary }>("/api/admin/site-map", { method: "GET", headers: {} }),
        fetchJson<{ siteMaps: NonNullable<SiteMapSummary>[] }>("/api/admin/site-maps", { method: "GET", headers: {} })
      ]);

      setStats(bootstrap);
      setGates(gatePayload.gates);
      setUsers(userPayload.users);
      setTexts(textPayload.texts);
      setLogs(logPayload.logs);
      setSystemStatus(statusPayload);
      setActiveSiteMap(siteMapPayload.siteMap);
      setSiteMaps(siteMapsPayload.siteMaps);
      setRetentionDaysInput(statusPayload.retentionDays ? String(statusPayload.retentionDays) : "90");
      setEditableGates(Object.fromEntries(gatePayload.gates.map((gate) => [gate.id, { ...gate }])));
      setEditableUsers(Object.fromEntries(userPayload.users.map((entry) => [entry.id, { ...entry, password: "" }])));
      setEditableTexts(Object.fromEntries(textPayload.texts.map((text) => [text.id, { ...text }])));
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Admin-Daten konnten nicht geladen werden.");
    }
  }, []);

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
          password: newUser.password,
          role: newUser.role,
          gateId: newUser.role === "guard" ? newUser.gateId || null : null
        })
      });
      setNewUser({ username: "", password: "", role: "guard", gateId: "" });
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

  async function runCleanup() {
    try {
      const result = await fetchJson<{ success: boolean; deletedCount: number }>("/api/admin/retention/cleanup", {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage(`Bereinigung abgeschlossen. Stornierte Alteintraege: ${result.deletedCount}.`);
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Bereinigung konnte nicht ausgefuehrt werden.");
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

  async function saveRetention(enabled: boolean, days: number | null) {
    try {
      await fetchJson("/api/admin/system-settings/retention", {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          ...(enabled ? { days: ((days ?? Number.parseInt(retentionDaysInput, 10)) || 90) } : {})
        })
      });
      setMessage("Aufbewahrung gespeichert.");
      setError(null);
      await loadAll();
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Aufbewahrung konnte nicht gespeichert werden.");
    }
  }

  return (
    <AppLayout>
      <main className="panel page-panel">
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
          <button type="button" className={activeSection === "audit" ? "tab-button tab-active" : "tab-button"} onClick={() => setActiveSection("audit")}>Audit</button>
          <button type="button" className={activeSection === "system" ? "tab-button tab-active" : "tab-button"} onClick={() => setActiveSection("system")}>System</button>
        </div>

        {message ? <Alert type="success">{message}</Alert> : null}
        {error ? <Alert type="error">{error}</Alert> : null}

        {activeSection === "dashboard" ? (
          <div className="card-grid admin-dashboard-grid">
            <article className="panel mini-card"><h3>Wachen</h3><p>{gates.filter((gate) => gate.isActive).length} aktive Wachen</p><button type="button" className="secondary-button" onClick={() => setActiveSection("wachen")}>Oeffnen</button></article>
            <article className="panel mini-card"><h3>Benutzer</h3><p>{users.filter((entry) => entry.isActive).length} aktive Benutzer</p><button type="button" className="secondary-button" onClick={() => setActiveSection("benutzer")}>Oeffnen</button></article>
            <article className="panel mini-card"><h3>Hinweistexte</h3><p>{texts.filter((text) => text.isActive).length} aktive Texte</p><button type="button" className="secondary-button" onClick={() => setActiveSection("texte")}>Oeffnen</button></article>
            <article className="panel mini-card"><h3>Gelaendeplan</h3><p>{activeSiteMap ? activeSiteMap.name : "Kein aktiver Plan"}</p><button type="button" className="secondary-button" onClick={() => setActiveSection("karte")}>Oeffnen</button></article>
            <article className="panel mini-card"><h3>Auditlog</h3><p>{logs.length} letzte Eintraege</p><button type="button" className="secondary-button" onClick={() => setActiveSection("audit")}>Oeffnen</button></article>
            <article className="panel mini-card"><h3>System / Aufbewahrung</h3><p>{systemStatus ? `${systemStatus.activeVisits} aktive Besuche` : "Lade..."}</p><button type="button" className="secondary-button" onClick={() => setActiveSection("system")}>Oeffnen</button></article>
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
            <input type="password" placeholder="Passwort (min. 8)" value={newUser.password} onChange={(event) => setNewUser((c) => ({ ...c, password: event.target.value }))} />
            <select value={newUser.role} onChange={(event) => setNewUser((c) => ({ ...c, role: event.target.value }))}>
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
              <thead><tr><th>Username</th><th>Rolle</th><th>Wache</th><th>Passwort</th><th>Status</th><th>Aktion</th></tr></thead>
              <tbody>
                {users.map((entry) => (
                  <tr key={entry.id}>
                    <td><input value={editableUsers[entry.id]?.username || ""} onChange={(event) => setEditableUsers((current) => ({ ...current, [entry.id]: { ...(current[entry.id] || entry), username: event.target.value } }))} /></td>
                    <td>
                      <select value={editableUsers[entry.id]?.role || entry.role} onChange={(event) => setEditableUsers((current) => ({ ...current, [entry.id]: { ...(current[entry.id] || entry), role: event.target.value as User["role"] } }))}>
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

        {activeSection === "system" ? (
          <>
            <Card>
              <h3>Aufbewahrung</h3>
              <p className="section-copy">
                {systemStatus
                  ? `Aufbewahrung: ${systemStatus.retentionEnabled ? `${systemStatus.retentionDays} Tage` : "deaktiviert"}. Ueberfaellige Besuche: ${systemStatus.staleVisits}.`
                  : "Status wird geladen..."}
              </p>
              <div className="form-grid two-columns">
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={retentionDaysInput}
                  onChange={(event) => setRetentionDaysInput(event.target.value)}
                  placeholder="Tage"
                />
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => void saveRetention(true, Number.parseInt(retentionDaysInput, 10) || 90)}>Aufbewahrung aktivieren</button>
                <button type="button" onClick={() => void saveRetention(false, null)}>Aufbewahrung deaktivieren</button>
                <button className="danger-button" type="button" onClick={() => void runCleanup()}>Bereinigung starten</button>
              </div>
            </Card>

            <Card>
              <h3>Systemstatus</h3>
              <div className="card-grid">
                <article className="panel mini-card"><h3>App</h3><p>{systemStatus?.app || "Lade..."}</p></article>
                <article className="panel mini-card"><h3>Aktive Wachen</h3><p>{systemStatus?.activeGates ?? "-"}</p></article>
                <article className="panel mini-card"><h3>Aktive Besucher</h3><p>{systemStatus?.activeVisits ?? "-"}</p></article>
                <article className="panel mini-card"><h3>Offene Voranmeldungen heute</h3><p>{systemStatus?.openPreRegistrationsToday ?? "-"}</p></article>
              </div>
            </Card>
          </>
        ) : null}

        {activeSection === "audit" ? <Card>
          <h3>Auditlog</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Zeit</th><th>User</th><th>Aktion</th><th>Objekt</th><th>IP</th></tr></thead>
              <tbody>{logs.map((log) => <tr key={log.id}><td>{formatDateTime(log.timestamp)}</td><td>{log.user}</td><td>{log.action}</td><td>{log.objectType}:{log.objectId}</td><td>{log.ipAddress || "-"}</td></tr>)}</tbody>
            </table>
          </div>
        </Card> : null}
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
  const [mode, setMode] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("bm-theme");

      if (saved === "light" || saved === "dark") {
        return saved;
      }
    }

    return "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    window.localStorage.setItem("bm-theme", mode);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((current) => (current === "light" ? "dark" : "light"));
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, toggle }}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeContext.Provider>
  );
}

export default App;
