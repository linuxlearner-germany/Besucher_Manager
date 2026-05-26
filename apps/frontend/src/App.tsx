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
  userAgent: string | null;
  metadataJson: string | null;
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
  gateId: string | null;
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
  visitorStreet: string | null;
  visitorHouseNumber: string | null;
  visitorPostalCode: string | null;
  visitorCity: string | null;
  visitorAddress: string | null;
  idDocumentType: string | null;
  idDocumentValidUntil: string | null;
  idDocumentNumber: string | null;
  idDocumentIssuingPlace: string | null;
  visitPurposeType: string | null;
  visitCompanyOrder: string | null;
  hostUnit: string | null;
  hostBuilding: string | null;
  hostRoom: string | null;
  hostExtension: string | null;
  visitEndType: string | null;
  forwardedToNote: string | null;
  devicePhotoApp: boolean | null;
  deviceFilmApp: boolean | null;
  deviceVideoCamera: boolean | null;
  deviceManufacturer: string | null;
  deviceSerialNumber: string | null;
  deviceAccessories: string | null;
  deviceDepositNote: string | null;
  deviceReturnConfirmed: boolean | null;
  deviceReturnedAt: string | null;
  deviceReturnedBy: string | null;
  checkInBy: string | null;
  checkOutBy: string | null;
};

type VisitDetail = VisitRow & {
  notes: string | null;
  badgeNumber: string | null;
  siteMap: { id: string; name: string; filePath: string } | null;
  badgeTexts: Array<{ id: string; name: string; textType: string; content: string }>;
  completeness: {
    canCheckIn: boolean;
    canPrintBadge: boolean;
    canCheckOut: boolean;
    missingRequiredFields: string[];
    errors: Array<{ field: string; message: string; severity: "error" | "warning" | "info" }>;
    warnings: Array<{ field: string; message: string; severity: "error" | "warning" | "info" }>;
    infos: Array<{ field: string; message: string; severity: "error" | "warning" | "info" }>;
  };
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
  returnedVisitNumber: string;
  signedByHostConfirmed: boolean;
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
  visitorStreet: string;
  visitorHouseNumber: string;
  visitorPostalCode: string;
  visitorCity: string;
  visitorAddress: string;
  idDocumentType: "identity_card" | "passport" | "other" | "";
  idDocumentValidUntil: string;
  idDocumentNumber: string;
  idDocumentIssuingPlace: string;
  visitPurposeType: "private" | "business" | "";
  visitCompanyOrder: string;
  hostUnit: string;
  hostBuilding: string;
  hostRoom: string;
  hostExtension: string;
  visitEndType: "ended" | "forwarded" | "";
  forwardedToNote: string;
  devicePhotoApp: boolean;
  deviceFilmApp: boolean;
  deviceVideoCamera: boolean;
  deviceManufacturer: string;
  deviceSerialNumber: string;
  deviceAccessories: string;
  deviceDepositNote: string;
  deviceReturnConfirmed: boolean;
  deviceReturnedAt: string;
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
  signaturesPending: number;
  signaturesFollowUp: number;
  signaturesExceptions: number;
};

type SibeVisitStatistics = {
  summary: {
    total: number;
    pre_registered: number;
    checked_in: number;
    checked_out: number;
  };
  by_day: Array<{ date: string; count: number }>;
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

type GuardCalendarItem = {
  id: string;
  badgeNumber: string | null;
  status: string;
  visitorName: string;
  company: string;
  hostName: string;
  hostDepartment: string;
  purpose: string;
  gateName: string;
  validFrom: string;
  validUntil: string;
  isUnassigned: boolean;
  licensePlate: string | null;
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

function getNextStepHint(visit: VisitDetail): string {
  if (visit.status === "pre_registered") {
    return visit.completeness.canCheckIn
      ? "Naechster Schritt: Daten pruefen und einchecken"
      : "Naechster Schritt: Fehlende Pflichtdaten ergaenzen";
  }
  if (visit.status === "checked_in") {
    return "Naechster Schritt: Besucherschein drucken und danach auschecken";
  }
  if (visit.status === "checked_out") {
    return "Besuch abgeschlossen";
  }
  return "Keine operative Aktion verfuegbar";
}

function formatUserAgent(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
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
  const today = new Date();

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
    validFrom: toDateInputValue(today),
    validUntil: toDateInputValue(today),
    phone: "",
    email: "",
    licensePlate: "",
    notes: ""
  };
}

function buildInitialCheckoutState(): CheckoutFormState {
  return {
    returnedVisitNumber: "",
    signedByHostConfirmed: false
  };
}

function buildCheckoutStateFromVisit(visit: VisitDetail): CheckoutFormState {
  return {
    returnedVisitNumber: visit.badgeNumber || visit.id.slice(0, 8).toUpperCase(),
    signedByHostConfirmed: false
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
    gateId: visit.gateId || "",
    validFrom: toDateInputValue(new Date(visit.validFrom)),
    validUntil: toDateInputValue(new Date(visit.validUntil)),
    notes: visit.notes || "",
    visitorStreet: visit.visitorStreet || "",
    visitorHouseNumber: visit.visitorHouseNumber || "",
    visitorPostalCode: visit.visitorPostalCode || "",
    visitorCity: visit.visitorCity || "",
    visitorAddress: visit.visitorAddress || "",
    idDocumentType: (visit.idDocumentType as GuardVisitEditState["idDocumentType"]) || "",
    idDocumentValidUntil: visit.idDocumentValidUntil || "",
    idDocumentNumber: visit.idDocumentNumber || "",
    idDocumentIssuingPlace: visit.idDocumentIssuingPlace || "",
    visitPurposeType: (visit.visitPurposeType as GuardVisitEditState["visitPurposeType"]) || "",
    visitCompanyOrder: visit.visitCompanyOrder || "",
    hostUnit: visit.hostUnit || "",
    hostBuilding: visit.hostBuilding || "",
    hostRoom: visit.hostRoom || "",
    hostExtension: visit.hostExtension || "",
    visitEndType: (visit.visitEndType as GuardVisitEditState["visitEndType"]) || "",
    forwardedToNote: visit.forwardedToNote || "",
    devicePhotoApp: Boolean(visit.devicePhotoApp),
    deviceFilmApp: Boolean(visit.deviceFilmApp),
    deviceVideoCamera: Boolean(visit.deviceVideoCamera),
    deviceManufacturer: visit.deviceManufacturer || "",
    deviceSerialNumber: visit.deviceSerialNumber || "",
    deviceAccessories: visit.deviceAccessories || "",
    deviceDepositNote: visit.deviceDepositNote || "",
    deviceReturnConfirmed: Boolean(visit.deviceReturnConfirmed),
    deviceReturnedAt: visit.deviceReturnedAt ? toLocalInputValue(new Date(visit.deviceReturnedAt)) : ""
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

function VisitDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
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
      setCheckoutState(buildCheckoutStateFromVisit(payload.visit));
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
      const detailFields = Array.isArray(errorPayload.details)
        ? (errorPayload.details as Array<{ message?: string }>).map((item) => item.message).filter(Boolean)
        : [];
      setError(
        detailFields.length
          ? `Check-in nicht moeglich: ${detailFields.join(" ")}`
          : errorPayload.message || "Check-in fehlgeschlagen."
      );
    }
  }

  async function handleCheckOut() {
    if (!id) return;
    try {
      setError(null);
      await fetchJson(`/api/guard/visits/${id}/check-out`, {
        method: "POST",
        body: JSON.stringify({
          returned_badge_number: checkoutState.returnedVisitNumber,
          signed_by_host_confirmed: checkoutState.signedByHostConfirmed
        })
      });
      setMessage("Besuch wurde ausgecheckt.");
      setCheckoutState(buildInitialCheckoutState());
      setIsCheckoutModalOpen(false);
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
          validFrom: editForm.validFrom,
          validUntil: editForm.validUntil
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

  const missingRequired = new Set(visit?.completeness?.missingRequiredFields ?? []);

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
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
            <Card className="detail-hero">
              <div className="detail-hero-main">
                <div className="detail-hero-left">
                  <div className="detail-hero-number">{visit.badgeNumber || visit.id.slice(0, 8).toUpperCase()}</div>
                  <div className="detail-hero-status-row">
                    <span className={statusClassName(visit.status)}>{formatStatus(visit.status)}</span>
                    <span className="detail-hero-label">Besuchsnummer</span>
                  </div>
                  <div className="detail-hero-name">{visit.firstName} {visit.lastName}</div>
                  <div className="detail-hero-company">{visit.company}</div>
                  <div className="detail-hero-purpose">Zweck: {visit.purpose}</div>
                </div>
                <div className="detail-hero-right">
                  <div className="detail-hero-item"><span>Gueltig</span><strong>{formatDateOnly(visit.validFrom)} - {formatDateOnly(visit.validUntil)}</strong></div>
                  <div className="detail-hero-item"><span>Check-in</span><strong>{visit.checkInAt ? `${formatDateTime(visit.checkInAt)}${visit.checkInBy ? ` durch ${visit.checkInBy}` : ""}` : "-"}</strong></div>
                  <div className="detail-hero-item"><span>Check-out</span><strong>{visit.checkOutAt ? `${formatDateTime(visit.checkOutAt)}${visit.checkOutBy ? ` durch ${visit.checkOutBy}` : ""}` : "offen"}</strong></div>
                </div>
              </div>
              <div className="detail-next-step">{getNextStepHint(visit)}</div>
              <div className="row-actions action-bar">
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
                  <button type="button" disabled={!visit.completeness.canCheckIn} onClick={() => void handleCheckIn()}>Einchecken</button>
                ) : null}
                {visit.status === "checked_in" ? (
                  <button type="button" onClick={() => setIsCheckoutModalOpen(true)}>Auschecken</button>
                ) : null}
                {visit.completeness.canPrintBadge ? (
                  <Link className="button-link" to={`/wache/besuche/${visit.id}/druck`}>
                    {visit.status === "checked_out" ? "Besucherschein erneut drucken" : "Besucherschein drucken"}
                  </Link>
                ) : null}
                <button type="button" className="secondary-button" onClick={() => navigate("/wache")}>Zurueck</button>
              </div>
            </Card>

            <Card className="completeness-panel">
              {visit.completeness.errors.length === 0 ? (
                <div className="feedback success compact-feedback">Pruefung: OK</div>
              ) : (
                <div className="feedback error">
                  <strong>Fehlende Pflichtdaten:</strong>
                  <ul className="text-list">
                    {visit.completeness.errors.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.message}</li>)}
                  </ul>
                  <div className="row-actions">
                    <button type="button" onClick={() => setIsEditing(true)}>Fehlende Daten ergaenzen</button>
                  </div>
                </div>
              )}
              {visit.completeness.warnings.length ? (
                <details className="compact-hints compact-hints-warning">
                  <summary>Warnungen anzeigen ({visit.completeness.warnings.length})</summary>
                  <ul className="text-list">{visit.completeness.warnings.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.message}</li>)}</ul>
                </details>
              ) : null}
              {visit.completeness.infos.length ? (
                <details className="compact-hints compact-hints-info">
                  <summary>Optionale Hinweise anzeigen ({visit.completeness.infos.length})</summary>
                  <ul className="text-list">{visit.completeness.infos.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.message}</li>)}</ul>
                </details>
              ) : null}
            </Card>

            {isEditing && editForm ? (
              <div className="form-section edit-guided-stack">
                <div className="row-actions action-bar">
                  <button type="button" onClick={() => void handleSaveVisit()}>Speichern</button>
                  <button type="button" className="secondary-button" onClick={() => { setIsEditing(false); setEditForm(buildGuardVisitEditState(visit)); setFieldErrors({}); }}>
                    Abbrechen
                  </button>
                </div>

                <Card className="edit-required-card">
                  <h3>Pflichtdaten fuer Check-in und Druck</h3>
                  <div className="form-grid two-columns">
                    <FormField label="Vorname" required error={fieldErrors.firstName}><input className={missingRequired.has("Vorname") ? "required-missing" : ""} value={editForm.firstName} onChange={(event) => setEditForm((current) => current ? { ...current, firstName: event.target.value } : current)} /></FormField>
                    <FormField label="Nachname" required error={fieldErrors.lastName}><input className={missingRequired.has("Nachname") ? "required-missing" : ""} value={editForm.lastName} onChange={(event) => setEditForm((current) => current ? { ...current, lastName: event.target.value } : current)} /></FormField>
                    <FormField label="Firma / Organisation" required error={fieldErrors.company}><input className={missingRequired.has("Firma / Organisation") ? "required-missing" : ""} value={editForm.company} onChange={(event) => setEditForm((current) => current ? { ...current, company: event.target.value } : current)} /></FormField>
                    <FormField label="Ansprechpartner" required error={fieldErrors.hostName}><input className={missingRequired.has("Ansprechpartner") ? "required-missing" : ""} value={editForm.hostName} onChange={(event) => setEditForm((current) => current ? { ...current, hostName: event.target.value } : current)} /></FormField>
                    <FormField label="Ansprechpartner Telefon" required error={fieldErrors.hostPhone}><input className={missingRequired.has("Ansprechpartner Telefon") ? "required-missing" : ""} value={editForm.hostPhone} onChange={(event) => setEditForm((current) => current ? { ...current, hostPhone: event.target.value } : current)} /></FormField>
                    <FormField label="Besuchszweck" required error={fieldErrors.purpose}><input className={missingRequired.has("Besuchszweck") ? "required-missing" : ""} value={editForm.purpose} onChange={(event) => setEditForm((current) => current ? { ...current, purpose: event.target.value } : current)} /></FormField>
                    <FormField label="Gueltig von" required error={fieldErrors.validFrom}><input className={missingRequired.has("Gueltig von") ? "required-missing" : ""} type="date" value={editForm.validFrom} onChange={(event) => setEditForm((current) => current ? { ...current, validFrom: event.target.value } : current)} /></FormField>
                    <FormField label="Gueltig bis" required error={fieldErrors.validUntil}><input className={missingRequired.has("Gueltig bis") ? "required-missing" : ""} type="date" value={editForm.validUntil} onChange={(event) => setEditForm((current) => current ? { ...current, validUntil: event.target.value } : current)} /></FormField>
                  </div>
                </Card>

                <Card>
                  <h3>Optionale Kontaktdaten</h3>
                  <div className="form-grid two-columns">
                    <FormField label="Geburtsdatum" error={fieldErrors.birthDate}><input type="date" value={editForm.birthDate} onChange={(event) => setEditForm((current) => current ? { ...current, birthDate: event.target.value } : current)} /></FormField>
                    <FormField label="Telefon Besucher" error={fieldErrors.phone}><input value={editForm.phone} onChange={(event) => setEditForm((current) => current ? { ...current, phone: event.target.value } : current)} /></FormField>
                    <FormField label="E-Mail Besucher" error={fieldErrors.email}><input value={editForm.email} onChange={(event) => setEditForm((current) => current ? { ...current, email: event.target.value } : current)} /></FormField>
                    <FormField label="Kennzeichen" error={fieldErrors.licensePlate}><input value={editForm.licensePlate} onChange={(event) => setEditForm((current) => current ? { ...current, licensePlate: event.target.value } : current)} /></FormField>
                    <FormField label="Ansprechpartner E-Mail" error={fieldErrors.hostEmail}><input value={editForm.hostEmail} onChange={(event) => setEditForm((current) => current ? { ...current, hostEmail: event.target.value } : current)} /></FormField>
                    <FormField label="Abteilung / Bereich" error={fieldErrors.hostDepartment}><input value={editForm.hostDepartment} onChange={(event) => setEditForm((current) => current ? { ...current, hostDepartment: event.target.value } : current)} /></FormField>
                  </div>
                </Card>

                <Card>
                  <h3>Adresse</h3>
                  <p className="section-copy">Adresse ist vollstaendig, wenn Strasse, Hausnummer, PLZ und Wohnort gesetzt sind. Alternativ kann die Anschrift als Freitext erfasst werden.</p>
                  <div className="form-grid two-columns">
                    <FormField label="Strasse" error={fieldErrors.visitorStreet}><input className={missingRequired.has("Strasse") || missingRequired.has("Adresse") ? "required-missing" : ""} value={editForm.visitorStreet} onChange={(event) => setEditForm((current) => current ? { ...current, visitorStreet: event.target.value } : current)} /></FormField>
                    <FormField label="Hausnummer" error={fieldErrors.visitorHouseNumber}><input className={missingRequired.has("Hausnummer") || missingRequired.has("Adresse") ? "required-missing" : ""} value={editForm.visitorHouseNumber} onChange={(event) => setEditForm((current) => current ? { ...current, visitorHouseNumber: event.target.value } : current)} /></FormField>
                    <FormField label="PLZ" error={fieldErrors.visitorPostalCode}><input className={missingRequired.has("PLZ") || missingRequired.has("Adresse") ? "required-missing" : ""} value={editForm.visitorPostalCode} onChange={(event) => setEditForm((current) => current ? { ...current, visitorPostalCode: event.target.value } : current)} /></FormField>
                    <FormField label="Wohnort" error={fieldErrors.visitorCity}><input className={missingRequired.has("Wohnort") || missingRequired.has("Adresse") ? "required-missing" : ""} value={editForm.visitorCity} onChange={(event) => setEditForm((current) => current ? { ...current, visitorCity: event.target.value } : current)} /></FormField>
                    <FormField label="Anschrift Freitext" error={fieldErrors.visitorAddress}><input className={missingRequired.has("Adresse") ? "required-missing" : ""} value={editForm.visitorAddress} onChange={(event) => setEditForm((current) => current ? { ...current, visitorAddress: event.target.value } : current)} /></FormField>
                  </div>
                </Card>

                <Card>
                  <h3>Ausweisdaten</h3>
                  <p className="section-copy">Ausweisdaten werden fuer den Wache-Prozess erfasst und nicht in Uebersichten angezeigt.</p>
                  <div className="form-grid two-columns">
                    <FormField label="Ausweisart" required error={fieldErrors.idDocumentType}><select className={missingRequired.has("Ausweisart") ? "required-missing" : ""} value={editForm.idDocumentType} onChange={(event) => setEditForm((current) => current ? { ...current, idDocumentType: event.target.value as GuardVisitEditState["idDocumentType"] } : current)}><option value="">-</option><option value="identity_card">Personalausweis</option><option value="passport">Reisepass</option><option value="other">Sonstiges</option></select></FormField>
                    <FormField label="Ausweis gueltig bis" required error={fieldErrors.idDocumentValidUntil}><input className={missingRequired.has("Ausweis gueltig bis") ? "required-missing" : ""} type="date" value={editForm.idDocumentValidUntil} onChange={(event) => setEditForm((current) => current ? { ...current, idDocumentValidUntil: event.target.value } : current)} /></FormField>
                    <FormField label="Ausweisnummer" required error={fieldErrors.idDocumentNumber}><input className={missingRequired.has("Ausweisnummer") ? "required-missing" : ""} value={editForm.idDocumentNumber} onChange={(event) => setEditForm((current) => current ? { ...current, idDocumentNumber: event.target.value } : current)} /></FormField>
                    <FormField label="Ausstellungsort" required error={fieldErrors.idDocumentIssuingPlace}><input className={missingRequired.has("Ausstellungsort") ? "required-missing" : ""} value={editForm.idDocumentIssuingPlace} onChange={(event) => setEditForm((current) => current ? { ...current, idDocumentIssuingPlace: event.target.value } : current)} /></FormField>
                  </div>
                </Card>

                <details className="panel">
                  <summary>Ziel / Raum optional</summary>
                  <div className="form-grid two-columns">
                    <FormField label="Dienststelle / Einheit"><input value={editForm.hostUnit} onChange={(event) => setEditForm((current) => current ? { ...current, hostUnit: event.target.value } : current)} /></FormField>
                    <FormField label="Gebaeude / Hausnummer"><input value={editForm.hostBuilding} onChange={(event) => setEditForm((current) => current ? { ...current, hostBuilding: event.target.value } : current)} /></FormField>
                    <FormField label="Zimmernummer"><input value={editForm.hostRoom} onChange={(event) => setEditForm((current) => current ? { ...current, hostRoom: event.target.value } : current)} /></FormField>
                    <FormField label="Apparat / Durchwahl"><input value={editForm.hostExtension} onChange={(event) => setEditForm((current) => current ? { ...current, hostExtension: event.target.value } : current)} /></FormField>
                  </div>
                </details>

                <details className="panel">
                  <summary>Besuchs-Zusatzdaten optional</summary>
                  <div className="form-grid two-columns">
                    <FormField label="Besuchszweck-Art"><select value={editForm.visitPurposeType} onChange={(event) => setEditForm((current) => current ? { ...current, visitPurposeType: event.target.value as GuardVisitEditState["visitPurposeType"] } : current)}><option value="">-</option><option value="private">privat</option><option value="business">geschaeftlich</option></select></FormField>
                    <FormField label="Auftrag Firma / Dienststelle"><input value={editForm.visitCompanyOrder} onChange={(event) => setEditForm((current) => current ? { ...current, visitCompanyOrder: event.target.value } : current)} /></FormField>
                    <FormField label="Besuch beendet / Weitergeleitet"><select value={editForm.visitEndType} onChange={(event) => setEditForm((current) => current ? { ...current, visitEndType: event.target.value as GuardVisitEditState["visitEndType"] } : current)}><option value="">-</option><option value="ended">beendet</option><option value="forwarded">weitergeleitet</option></select></FormField>
                    <FormField label="Weitergeleitet an"><input value={editForm.forwardedToNote} onChange={(event) => setEditForm((current) => current ? { ...current, forwardedToNote: event.target.value } : current)} /></FormField>
                  </div>
                </details>

                <details className="panel">
                  <summary>Mitgefuehrte Geraete optional</summary>
                  <div className="form-grid two-columns">
                    <label className="checkbox-row"><input type="checkbox" checked={editForm.devicePhotoApp} onChange={(event) => setEditForm((current) => current ? { ...current, devicePhotoApp: event.target.checked } : current)} />Foto-Apparat</label>
                    <label className="checkbox-row"><input type="checkbox" checked={editForm.deviceFilmApp} onChange={(event) => setEditForm((current) => current ? { ...current, deviceFilmApp: event.target.checked } : current)} />Film-Apparat</label>
                    <label className="checkbox-row"><input type="checkbox" checked={editForm.deviceVideoCamera} onChange={(event) => setEditForm((current) => current ? { ...current, deviceVideoCamera: event.target.checked } : current)} />Video-Kamera</label>
                    <label className="checkbox-row"><input type="checkbox" checked={editForm.deviceReturnConfirmed} onChange={(event) => setEditForm((current) => current ? { ...current, deviceReturnConfirmed: event.target.checked } : current)} />Rueckgabe bestaetigt</label>
                    <FormField label="Fabrikat"><input value={editForm.deviceManufacturer} onChange={(event) => setEditForm((current) => current ? { ...current, deviceManufacturer: event.target.value } : current)} /></FormField>
                    <FormField label="Fabriknummer"><input value={editForm.deviceSerialNumber} onChange={(event) => setEditForm((current) => current ? { ...current, deviceSerialNumber: event.target.value } : current)} /></FormField>
                    <FormField label="Zubehoerteile"><input value={editForm.deviceAccessories} onChange={(event) => setEditForm((current) => current ? { ...current, deviceAccessories: event.target.value } : current)} /></FormField>
                    <FormField label="Abgabe-Bemerkung"><input value={editForm.deviceDepositNote} onChange={(event) => setEditForm((current) => current ? { ...current, deviceDepositNote: event.target.value } : current)} /></FormField>
                    <FormField label="Rueckgabe am"><input type="datetime-local" value={editForm.deviceReturnedAt} onChange={(event) => setEditForm((current) => current ? { ...current, deviceReturnedAt: event.target.value } : current)} /></FormField>
                  </div>
                </details>

                <Card>
                  <h3>Bemerkung</h3>
                  <FormField label="Bemerkung" error={fieldErrors.notes}><textarea rows={3} value={editForm.notes} onChange={(event) => setEditForm((current) => current ? { ...current, notes: event.target.value } : current)} /></FormField>
                </Card>

                <div className="row-actions action-bar">
                  <button type="button" onClick={() => void handleSaveVisit()}>Speichern</button>
                  <button type="button" className="secondary-button" onClick={() => { setIsEditing(false); setEditForm(buildGuardVisitEditState(visit)); setFieldErrors({}); }}>
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <div className="detail-card-grid">
                <Card>
                  <h3>Besucher</h3>
                  <div className="detail-grid">
                    <div><span className="detail-label">Name</span><strong>{visit.firstName} {visit.lastName}</strong></div>
                    <div><span className="detail-label">Firma / Organisation</span><strong>{visit.company}</strong></div>
                    {visit.birthDate ? <div><span className="detail-label">Geburtsdatum</span><strong>{formatDateOnly(visit.birthDate)}</strong></div> : null}
                    {visit.visitorPhone ? <div><span className="detail-label">Telefon</span><strong>{visit.visitorPhone}</strong></div> : null}
                    {visit.visitorEmail ? <div><span className="detail-label">E-Mail</span><strong>{visit.visitorEmail}</strong></div> : null}
                    {visit.licensePlate ? <div><span className="detail-label">Kennzeichen</span><strong>{visit.licensePlate}</strong></div> : null}
                    {visit.visitorAddress || visit.visitorStreet || visit.visitorHouseNumber || visit.visitorPostalCode || visit.visitorCity ? (
                      <div className="detail-span-2">
                        <span className="detail-label">Adresse</span>
                        <strong>
                          {visit.visitorAddress
                            || [visit.visitorStreet, visit.visitorHouseNumber, visit.visitorPostalCode, visit.visitorCity].filter(Boolean).join(", ")}
                        </strong>
                      </div>
                    ) : null}
                  </div>
                </Card>
                <Card>
                  <h3>Ansprechpartner</h3>
                  <div className="detail-grid">
                    <div><span className="detail-label">Ansprechpartner</span><strong>{visit.hostName}</strong></div>
                    <div><span className="detail-label">Telefon</span><strong>{visit.hostPhone || "-"}</strong></div>
                    {visit.hostEmail ? <div><span className="detail-label">E-Mail</span><strong>{visit.hostEmail}</strong></div> : null}
                    {visit.hostDepartment ? <div><span className="detail-label">Abteilung / Bereich</span><strong>{visit.hostDepartment}</strong></div> : null}
                    {visit.hostUnit ? <div><span className="detail-label">Dienststelle / Einheit</span><strong>{visit.hostUnit}</strong></div> : null}
                    {visit.hostBuilding ? <div><span className="detail-label">Gebaeude / Haus</span><strong>{visit.hostBuilding}</strong></div> : null}
                    {visit.hostRoom ? <div><span className="detail-label">Zimmer</span><strong>{visit.hostRoom}</strong></div> : null}
                    {visit.hostExtension ? <div><span className="detail-label">Apparat</span><strong>{visit.hostExtension}</strong></div> : null}
                  </div>
                </Card>
                <Card>
                  <h3>Besuch</h3>
                  <div className="detail-grid">
                    <div><span className="detail-label">Besuchszweck</span><strong>{visit.purpose}</strong></div>
                    <div><span className="detail-label">Gueltig von</span><strong>{formatDateOnly(visit.validFrom)}</strong></div>
                    <div><span className="detail-label">Gueltig bis</span><strong>{formatDateOnly(visit.validUntil)}</strong></div>
                    {visit.notes ? <div className="detail-span-2"><span className="detail-label">Bemerkung</span><strong>{visit.notes}</strong></div> : null}
                    {visit.visitPurposeType ? <div><span className="detail-label">Besuchszweck-Art</span><strong>{visit.visitPurposeType}</strong></div> : null}
                    {visit.visitCompanyOrder ? <div><span className="detail-label">Auftrag Firma / Dienststelle</span><strong>{visit.visitCompanyOrder}</strong></div> : null}
                  </div>
                </Card>
                <Card className="detail-check-card">
                  <h3>Check-in / Check-out</h3>
                  <div className="detail-grid">
                    <div><span className="detail-label">Eingecheckt am</span><strong>{formatDateTime(visit.checkInAt)}</strong></div>
                    <div><span className="detail-label">Eingecheckt durch</span><strong>{visit.checkInBy || "-"}</strong></div>
                    <div><span className="detail-label">Ausgecheckt am</span><strong>{formatDateTime(visit.checkOutAt)}</strong></div>
                    <div><span className="detail-label">Ausgecheckt durch</span><strong>{visit.checkOutBy || "-"}</strong></div>
                    <div><span className="detail-label">Unterschrift erledigt</span><strong>{visit.signedByHostConfirmed ? "Ja" : "Nein"}</strong></div>
                  </div>
                </Card>

                {(visit.idDocumentType || visit.idDocumentValidUntil || visit.idDocumentNumber || visit.idDocumentIssuingPlace) ? (
                  <details className="panel">
                    <summary>Ausweis / Zusatzdaten</summary>
                    <div className="detail-grid">
                      {visit.idDocumentType ? <div><span className="detail-label">Ausweisart</span><strong>{visit.idDocumentType}</strong></div> : null}
                      {visit.idDocumentValidUntil ? <div><span className="detail-label">Gueltig bis</span><strong>{formatDateOnly(visit.idDocumentValidUntil)}</strong></div> : null}
                      {visit.idDocumentNumber ? <div><span className="detail-label">Ausweisnummer</span><strong>{visit.idDocumentNumber}</strong></div> : null}
                      {visit.idDocumentIssuingPlace ? <div><span className="detail-label">Ausstellungsort</span><strong>{visit.idDocumentIssuingPlace}</strong></div> : null}
                    </div>
                  </details>
                ) : null}

                {(visit.devicePhotoApp || visit.deviceFilmApp || visit.deviceVideoCamera || visit.deviceManufacturer || visit.deviceSerialNumber || visit.deviceAccessories || visit.deviceDepositNote) ? (
                  <details className="panel">
                    <summary>Mitgefuehrte Geraete</summary>
                    <div className="detail-grid">
                      {visit.devicePhotoApp ? <div><span className="detail-label">Foto-Apparat</span><strong>Ja</strong></div> : null}
                      {visit.deviceFilmApp ? <div><span className="detail-label">Film-Apparat</span><strong>Ja</strong></div> : null}
                      {visit.deviceVideoCamera ? <div><span className="detail-label">Video-Kamera</span><strong>Ja</strong></div> : null}
                      {visit.deviceManufacturer ? <div><span className="detail-label">Fabrikat</span><strong>{visit.deviceManufacturer}</strong></div> : null}
                      {visit.deviceSerialNumber ? <div><span className="detail-label">Fabriknummer</span><strong>{visit.deviceSerialNumber}</strong></div> : null}
                      {visit.deviceAccessories ? <div><span className="detail-label">Zubehoer</span><strong>{visit.deviceAccessories}</strong></div> : null}
                      {visit.deviceDepositNote ? <div className="detail-span-2"><span className="detail-label">Abgabe-Bemerkung</span><strong>{visit.deviceDepositNote}</strong></div> : null}
                    </div>
                  </details>
                ) : null}
              </div>
            )}

            {isCheckoutModalOpen && visit.status === "checked_in" ? (
              <div className="modal-backdrop">
                <div className="modal-card panel">
                  <h3>Besuch auschecken</h3>
                  <p className="section-copy">Besuchsnummer vom zurueckgegebenen Besucherschein eingeben.</p>
                  <div className="checkout-box">
                    <input
                      placeholder="Besuchsnummer vom Besucherschein"
                      maxLength={5}
                      value={checkoutState.returnedVisitNumber}
                      onChange={(event) => setCheckoutState((current) => ({
                        ...current,
                        returnedVisitNumber: event.target.value.toUpperCase().slice(0, 5)
                      }))}
                    />
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={checkoutState.signedByHostConfirmed}
                        onChange={(event) => setCheckoutState((current) => ({ ...current, signedByHostConfirmed: event.target.checked }))}
                      />
                      Unterschrift vom Ansprechpartner erledigt
                    </label>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      disabled={!checkoutState.returnedVisitNumber.trim() || !checkoutState.signedByHostConfirmed}
                      onClick={() => void handleCheckOut()}
                    >
                      Auschecken
                    </button>
                    <button type="button" className="secondary-button" onClick={() => setIsCheckoutModalOpen(false)}>Abbrechen</button>
                  </div>
                </div>
              </div>
            ) : null}

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
  const hasDeviceInfo = Boolean(
    visit?.devicePhotoApp
    || visit?.deviceFilmApp
    || visit?.deviceVideoCamera
    || visit?.deviceManufacturer
    || visit?.deviceSerialNumber
    || visit?.deviceAccessories
  );
  const hasOptionalPageTwoContent = Boolean((visit?.siteMap || securityTexts.length || hasDeviceInfo));

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
                <div><span>Adresse</span><strong>{visit.visitorAddress || [visit.visitorStreet, visit.visitorHouseNumber, visit.visitorPostalCode, visit.visitorCity].filter(Boolean).join(", ") || "-"}</strong></div>
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

                {hasDeviceInfo ? (
                  <section className="print-columns">
                    <div className="print-block avoid-break">
                      <h3>Mitgefuehrte Geraete (optional)</h3>
                      <ul className="text-list compact-list">
                        <li><strong>Foto-Apparat:</strong> {visit.devicePhotoApp ? "Ja" : "Nein"}</li>
                        <li><strong>Film-Apparat:</strong> {visit.deviceFilmApp ? "Ja" : "Nein"}</li>
                        <li><strong>Video-Kamera:</strong> {visit.deviceVideoCamera ? "Ja" : "Nein"}</li>
                        <li><strong>Fabrikat/Seriennr:</strong> {[visit.deviceManufacturer, visit.deviceSerialNumber].filter(Boolean).join(" / ") || "-"}</li>
                        <li><strong>Zubehoer:</strong> {visit.deviceAccessories || "-"}</li>
                      </ul>
                    </div>
                  </section>
                ) : null}
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
      <main className="panel page-panel page-shell-wide">
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
              <div><dt>Anschrift</dt><dd>{visit.visitorAddress || "-"}</dd></div>
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
              <div><dt>Foto-Apparat</dt><dd>{visit.devicePhotoApp ? "Ja" : "Nein"}</dd></div>
              <div><dt>Film-Apparat</dt><dd>{visit.deviceFilmApp ? "Ja" : "Nein"}</dd></div>
              <div><dt>Video-Kamera</dt><dd>{visit.deviceVideoCamera ? "Ja" : "Nein"}</dd></div>
              <div><dt>Fabrikat</dt><dd>{visit.deviceManufacturer || "-"}</dd></div>
              <div><dt>Fabriknummer</dt><dd>{visit.deviceSerialNumber || "-"}</dd></div>
              <div><dt>Zubehoerteile</dt><dd>{visit.deviceAccessories || "-"}</dd></div>
              <div><dt>Abgabe-Bemerkung</dt><dd>{visit.deviceDepositNote || "-"}</dd></div>
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
    signaturesPending: number;
    signaturesFollowUp: number;
    signaturesExceptions: number;
    staleVisits: number;
    retentionDays: number | null;
    retentionEnabled: boolean;
  } | null>(null);
  const [activeSiteMap, setActiveSiteMap] = useState<SiteMapSummary>(null);
  const [siteMaps, setSiteMaps] = useState<NonNullable<SiteMapSummary>[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAuditLogId, setSelectedAuditLogId] = useState<string | null>(null);
  const [auditFilters, setAuditFilters] = useState({
    search: "",
    action: "",
    user: "",
    ip: "",
    from: "",
    to: ""
  });

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
  const [editableGates, setEditableGates] = useState<Record<string, AdminGate>>({});
  const [editableUsers, setEditableUsers] = useState<Record<string, EditableAdminUser>>({});
  const [editableTexts, setEditableTexts] = useState<Record<string, AdminBadgeText>>({});

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

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [bootstrap, gatePayload, userPayload, textPayload, statusPayload, siteMapPayload, siteMapsPayload] = await Promise.all([
        fetchJson<{ users: number; gates: number; templates: number }>("/api/admin/bootstrap", { method: "GET", headers: {} }),
        fetchJson<{ gates: AdminGate[] }>("/api/admin/gates", { method: "GET", headers: {} }),
        fetchJson<{ users: AdminUser[] }>("/api/admin/users", { method: "GET", headers: {} }),
        fetchJson<{ texts: AdminBadgeText[] }>("/api/admin/badge-texts", { method: "GET", headers: {} }),
        fetchJson<{ app: string; activeVisits: number; activeGates: number; openPreRegistrationsToday: number; signaturesPending: number; signaturesFollowUp: number; signaturesExceptions: number; staleVisits: number; retentionDays: number | null; retentionEnabled: boolean }>("/api/admin/system-status", { method: "GET", headers: {} }),
        fetchJson<{ siteMap: SiteMapSummary }>("/api/admin/site-map", { method: "GET", headers: {} }),
        fetchJson<{ siteMaps: NonNullable<SiteMapSummary>[] }>("/api/admin/site-maps", { method: "GET", headers: {} })
      ]);

      setStats(bootstrap);
      setGates(gatePayload.gates);
      setUsers(userPayload.users);
      setTexts(textPayload.texts);
      setSystemStatus(statusPayload);
      setActiveSiteMap(siteMapPayload.siteMap);
      setSiteMaps(siteMapsPayload.siteMaps);
      setEditableGates(Object.fromEntries(gatePayload.gates.map((gate) => [gate.id, { ...gate }])));
      setEditableUsers(Object.fromEntries(userPayload.users.map((entry) => [entry.id, { ...entry, password: "" }])));
      setEditableTexts(Object.fromEntries(textPayload.texts.map((text) => [text.id, { ...text }])));
      await loadAuditLogs(auditFilters);
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Admin-Daten konnten nicht geladen werden.");
    }
  }, [auditFilters, loadAuditLogs]);

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
          <button type="button" className={activeSection === "audit" ? "tab-button tab-active" : "tab-button"} onClick={() => setActiveSection("audit")}>Audit</button>
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
            <article className="panel mini-card"><h3>Auditlog</h3><p>{logs.length} letzte Eintraege</p><button type="button" className="secondary-button" onClick={() => setActiveSection("audit")}>Oeffnen</button></article>
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
