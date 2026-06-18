import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";

export type User = {
  id: string;
  username: string;
  role: "admin" | "guard" | "sibe";
  gateId: string | null;
};

export type Gate = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
};

export type AdminGate = Gate & { isActive: boolean; sortOrder: number };
export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "guard" | "sibe";
  gateId: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
};
export type EditableAdminUser = AdminUser & { password?: string };

export type AdminBadgeText = {
  id: string;
  name: string;
  textType: "security_notice" | "photo_ban" | "signature_notice" | "footer";
  content: string;
  isActive: boolean;
};

export type AdminAuditLog = {
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

export type AdminFieldDefinition = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  section: string;
  isSystem: boolean;
  isActive: boolean;
  showInPublic: boolean;
  showInGuard: boolean;
  showInSibe: boolean;
  showOnBadge: boolean;
  requiredPublic: boolean;
  requiredGuardCheckin: boolean;
  requiredBeforePrint: boolean;
  sortOrder: number;
  helpText: string | null;
  optionsJson: string | null;
};

export type FieldConfigExportPayload = {
  schema: "besucher-manager-field-config";
  version: 1;
  exportedAt: string;
  app: string;
  fields: Array<{
    fieldKey: string;
    label: string;
    fieldType: string;
    section: string;
    isSystem: boolean;
    isActive: boolean;
    showInPublic: boolean;
    showInGuard: boolean;
    showInSibe: boolean;
    showOnBadge: boolean;
    requiredPublic: boolean;
    requiredGuardCheckin: boolean;
    requiredBeforePrint: boolean;
    sortOrder: number;
    helpText: string | null;
    options: unknown;
  }>;
};

export type NewFieldDefinitionForm = {
  label: string;
  fieldType: string;
  section: string;
  helpText: string;
  sortOrder: number;
  showInPublic: boolean;
  showInGuard: boolean;
  showInSibe: boolean;
  showOnBadge: boolean;
  requiredPublic: boolean;
  requiredGuardCheckin: boolean;
  requiredBeforePrint: boolean;
  isActive: boolean;
  optionsJson: string;
};

export type VisitRow = {
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

export type VisitDetail = VisitRow & {
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

export type SibeVisitDetail = Omit<VisitDetail, "siteMap" | "badgeTexts">;

export type FormState = {
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

export type ApiError = {
  error: string;
  message?: string;
  details?: unknown;
  retryAfterSeconds?: number;
};

export type AuthContextValue = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
};

export type SubmitState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export type FieldErrorState = Partial<Record<keyof FormState, string>>;

export type CheckoutFormState = {
  returnedVisitNumber: string;
  signedByHostConfirmed: boolean;
};

export type GuardVisitEditState = {
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

export type SiteMapSummary = {
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

export type SibeSummary = {
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

export type SibeVisitStatistics = {
  summary: {
    total: number;
    pre_registered: number;
    checked_in: number;
    checked_out: number;
  };
  by_day: Array<{ date: string; count: number }>;
};

export type SibeVisitRow = {
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

export type SibeVisitorRow = {
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

export type SibeUserRow = {
  id: string;
  username: string;
  role: "admin" | "guard" | "sibe";
  gateName: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export type GuardCalendarItem = {
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

export const BRANDING = {
  logo: "/branding/wiweb-logo-kurz-blau_neu.png",
  icon: "/branding/WIWEB-waage-vektor_ohne_schrift.png",
  background: "/branding/background.png"
};

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatDateOnly(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium"
  }).format(new Date(value));
}

export function formatStatus(status: string): string {
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

export function formatSignatureStatus(status: VisitRow["hostSignatureStatus"] | string): string {
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

export function getNextStepHint(visit: VisitDetail): string {
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

export function formatUserAgent(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
}

export function formatFileSize(value: number | null | undefined): string {
  if (!value || value < 0) {
    return "-";
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function statusClassName(status: string): string {
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

export function formatTextType(textType: AdminBadgeText["textType"]): string {
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

export function extractFieldErrors(error: ApiError): Record<string, string> {
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

export function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function toDateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function buildInitialFormState(): FormState {
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

export function buildInitialCheckoutState(): CheckoutFormState {
  return {
    returnedVisitNumber: "",
    signedByHostConfirmed: false
  };
}

export function buildCheckoutStateFromVisit(visit: VisitDetail): CheckoutFormState {
  return {
    returnedVisitNumber: visit.badgeNumber || visit.id.slice(0, 8).toUpperCase(),
    signedByHostConfirmed: false
  };
}

export function buildGuardVisitEditState(visit: VisitDetail): GuardVisitEditState {
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

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
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

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("AuthContext missing");
  }

  return context;
}

export function useThemeMode() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("ThemeContext missing");
  }

  return context;
}

export function AuthProvider({ children }: PropsWithChildren) {
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

export function ThemeProvider({ children }: PropsWithChildren) {
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

  return <ThemeContext.Provider value={{ mode, toggle }}>{children}</ThemeContext.Provider>;
}

export function LoadingScreen() {
  return (
    <div className="shell app-shell">
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

export function AppLayout({ children }: PropsWithChildren) {
  const { user, logout } = useAuth();
  const { mode, toggle } = useThemeMode();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="shell app-shell">
      <div className="content-container">
        <header className="topbar app-header">
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

export function RequireRoles({
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
