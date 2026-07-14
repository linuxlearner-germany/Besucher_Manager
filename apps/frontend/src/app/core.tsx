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

export type AppRole = "admin" | "guard" | "sibe" | "kaskdt" | "custom";
export type AppMenuKey = "voranmeldung" | "wache" | "import" | "admin" | "genehmigung" | "sibe" | "kaskdt" | "texte";
export type AppPermission =
  | "visits.read"
  | "visits.create"
  | "visits.update"
  | "visits.delete"
  | "visits.checkIn"
  | "visits.checkOut"
  | "visits.printBadge"
  | "imports.execute"
  | "approvals.read"
  | "approvals.review"
  | "approvals.approve"
  | "approvals.reject"
  | "dashboards.sibe"
  | "dashboards.commander"
  | "admin.users"
  | "admin.guards"
  | "admin.texts"
  | "admin.map"
  | "admin.fields"
  | "admin.system"
  | "logs.audit"
  | "logs.errors";

export type UserPermissions = {
  menu: {
    preRegistration: boolean;
    guard: boolean;
    import: boolean;
    admin: boolean;
    approvals: boolean;
    sibe: boolean;
    commander: boolean;
    texts: boolean;
  };
  visits: {
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
    checkIn: boolean;
    checkOut: boolean;
    printBadge: boolean;
  };
  imports: {
    execute: boolean;
  };
  approvals: {
    read: boolean;
    review: boolean;
    approve: boolean;
    reject: boolean;
  };
  dashboards: {
    sibe: boolean;
    commander: boolean;
  };
  admin: {
    users: boolean;
    guards: boolean;
    texts: boolean;
    map: boolean;
    fields: boolean;
    system: boolean;
  };
  logs: {
    audit: boolean;
    errors: boolean;
  };
};

type UserPermissionsInput = {
  menu?: Partial<UserPermissions["menu"]>;
  visits?: Partial<UserPermissions["visits"]>;
  imports?: Partial<UserPermissions["imports"]>;
  approvals?: Partial<UserPermissions["approvals"]>;
  dashboards?: Partial<UserPermissions["dashboards"]>;
  admin?: Partial<UserPermissions["admin"]>;
  logs?: Partial<UserPermissions["logs"]>;
};

export type User = {
  id: string;
  username: string;
  role: AppRole;
  gateId: string | null;
  gateName?: string | null;
  groups: string[];
  menuAccess: AppMenuKey[];
  permissions: UserPermissions;
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
  email: string | null;
  role: AppRole;
  gateId: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  groups: string[];
  menuAccess: AppMenuKey[];
  permissions: UserPermissions;
};
export type EditableAdminUser = AdminUser & { password?: string };

export type AdminBadgeText = {
  id: string;
  name: string;
  textType: string;
  sectionType: string;
  sectionLabel: string;
  heading: string;
  customHeading: string | null;
  content: string;
  isActive: boolean;
  sortOrder: number;
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

export type AdminErrorLog = {
  id: string;
  level: string;
  errorCode: string;
  message: string;
  requestPath: string | null;
  requestMethod: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  userName: string | null;
  stackTrace: string | null;
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
  approvalStatus: "not_required" | "pending" | "approved" | "rejected";
  approvalNote: string | null;
  approvalDecidedBy: string | null;
  approvalDecidedAt: string | null;
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
  badgeTexts: Array<{ id: string; name: string; textType: string; sectionType: string; customHeading: string | null; content: string; sortOrder: number }>;
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
  gateId: string;
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
  idDocumentType: "identity_card" | "passport" | "other" | "";
  idDocumentValidUntil: string;
  idDocumentNumber: string;
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

const defaultMenuAccessByRole: Record<User["role"], AppMenuKey[]> = {
  admin: ["voranmeldung", "wache", "import", "admin", "genehmigung", "sibe", "kaskdt", "texte"],
  guard: ["voranmeldung", "wache", "import"],
  sibe: ["genehmigung", "sibe", "import"],
  kaskdt: ["kaskdt"],
  custom: []
};

const allowedMenuAccessByRole: Record<User["role"], AppMenuKey[]> = {
  admin: ["voranmeldung", "wache", "import", "admin", "genehmigung", "sibe", "kaskdt", "texte"],
  guard: ["voranmeldung", "wache", "import"],
  sibe: ["genehmigung", "sibe", "import"],
  kaskdt: ["kaskdt"],
  custom: ["voranmeldung", "wache", "import", "admin", "genehmigung", "sibe", "kaskdt", "texte"]
};

function createEmptyPermissions(): UserPermissions {
  return {
    menu: {
      preRegistration: false,
      guard: false,
      import: false,
      admin: false,
      approvals: false,
      sibe: false,
      commander: false,
      texts: false
    },
    visits: {
      read: false,
      create: false,
      update: false,
      delete: false,
      checkIn: false,
      checkOut: false,
      printBadge: false
    },
    imports: {
      execute: false
    },
    approvals: {
      read: false,
      review: false,
      approve: false,
      reject: false
    },
    dashboards: {
      sibe: false,
      commander: false
    },
    admin: {
      users: false,
      guards: false,
      texts: false,
      map: false,
      fields: false,
      system: false
    },
    logs: {
      audit: false,
      errors: false
    }
  };
}

function mergePermissions(base: UserPermissions, override?: UserPermissionsInput | null): UserPermissions {
  if (!override) {
    return base;
  }

  return {
    menu: { ...base.menu, ...(override.menu ?? {}) },
    visits: { ...base.visits, ...(override.visits ?? {}) },
    imports: { ...base.imports, ...(override.imports ?? {}) },
    approvals: { ...base.approvals, ...(override.approvals ?? {}) },
    dashboards: { ...base.dashboards, ...(override.dashboards ?? {}) },
    admin: { ...base.admin, ...(override.admin ?? {}) },
    logs: { ...base.logs, ...(override.logs ?? {}) }
  };
}

export function getDefaultPermissionsForRole(role: User["role"]): UserPermissions {
  switch (role) {
    case "admin":
      return mergePermissions(createEmptyPermissions(), {
        menu: { preRegistration: true, guard: true, import: true, admin: true, approvals: true, sibe: true, commander: true, texts: true },
        visits: { read: true, create: true, update: true, delete: true, checkIn: true, checkOut: true, printBadge: true },
        imports: { execute: true },
        approvals: { read: true, review: true, approve: true, reject: true },
        dashboards: { sibe: true, commander: true },
        admin: { users: true, guards: true, texts: true, map: true, fields: true, system: true },
        logs: { audit: true, errors: true }
      });
    case "guard":
      return mergePermissions(createEmptyPermissions(), {
        menu: { preRegistration: true, guard: true, import: true, admin: false, approvals: false, sibe: false, commander: false, texts: false },
        visits: { read: true, create: true, update: true, delete: false, checkIn: true, checkOut: true, printBadge: true },
        imports: { execute: true }
      });
    case "sibe":
      return mergePermissions(createEmptyPermissions(), {
        menu: { preRegistration: false, guard: false, import: true, admin: false, approvals: true, sibe: true, commander: false, texts: false },
        visits: { read: true, create: true, update: true, delete: false, checkIn: false, checkOut: false, printBadge: false },
        imports: { execute: true },
        approvals: { read: true, review: true, approve: true, reject: true },
        dashboards: { sibe: true, commander: false }
      });
    case "kaskdt":
      return mergePermissions(createEmptyPermissions(), {
        menu: { preRegistration: false, guard: false, import: false, admin: false, approvals: false, sibe: false, commander: true, texts: false },
        visits: { read: true, create: false, update: false, delete: false, checkIn: false, checkOut: false, printBadge: false },
        approvals: { read: true, review: false, approve: false, reject: false },
        dashboards: { sibe: false, commander: true }
      });
    case "custom":
      return createEmptyPermissions();
  }
}

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
  approvalsPending: number;
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
  idDocumentValidUntil: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  hostSignatureStatus: string;
  approvalStatus: "not_required" | "pending" | "approved" | "rejected";
};

export type AdminWorkflowSettings = {
  approvalRequired: boolean;
  backgroundMode: "image" | "subtle" | "plain";
  backgroundImageUrl: string;
  backgroundImageName: string | null;
  backgroundImageOriginalFileName: string | null;
  emailRelay: {
    source: "database" | "yml";
    configPath: string | null;
    isReadOnly: boolean;
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    fromAddress: string;
    approvalRecipients: string[];
    hasPassword: boolean;
  };
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
  role: "admin" | "guard" | "sibe" | "kaskdt";
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
const ThemeContext = createContext<{
  mode: "light" | "dark";
  toggle: () => void;
  backgroundMode: "image" | "subtle" | "plain";
  setBackgroundMode: (mode: "image" | "subtle" | "plain") => void;
  setBackgroundImageUrl: (url: string) => void;
} | null>(null);

export const BRANDING = {
  logo: "/branding/wiweb-logo-kurz-blau_neu.png",
  icon: "/branding/WIWEB-waage-vektor_ohne_schrift.png",
  background: ""
};

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDateOnly(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
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
      return "Bestätigung fehlt";
    case "signed_same_day":
      return "Bestätigung liegt vor";
    case "signed_later":
      return "Nachreichung offen";
    case "missing_exception":
      return "Ohne Bestätigung dokumentiert";
    case "not_required":
      return "Nicht bestätigt";
    default:
      return status;
  }
}

export function formatApprovalStatus(status: VisitRow["approvalStatus"] | string): string {
  switch (status) {
    case "pending":
      return "Freigabe offen";
    case "approved":
      return "Freigegeben";
    case "rejected":
      return "Abgelehnt";
    case "not_required":
      return "Keine Freigabe";
    default:
      return status;
  }
}

export function formatIdDocumentType(value: string | null | undefined): string {
  switch (value) {
    case "identity_card":
      return "Personalausweis";
    case "passport":
      return "Reisepass";
    case "other":
      return "Sonstiges";
    case "":
    case null:
    case undefined:
      return "-";
    default:
      return value;
  }
}

export function formatRoleLabel(role: User["role"] | AdminUser["role"]): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "guard":
      return "Wache";
    case "sibe":
      return "SiBe";
    case "kaskdt":
      return "KasKdt";
    case "custom":
      return "Benutzerdefiniert";
    default:
      return role;
  }
}

export function formatAuditAction(action: string): string {
  switch (action) {
    case "VISIT_CHECKED_OUT":
      return "Besucher ausgecheckt";
    case "VISIT_CHECKED_IN":
      return "Besucher eingecheckt";
    case "VISIT_APPROVED":
      return "Besuch freigegeben";
    case "VISIT_REJECTED":
      return "Besuch abgelehnt";
    case "PUBLIC_PRE_REGISTRATION_CREATED":
      return "Voranmeldung erstellt";
    case "SIBE_VISIT_NOTES_UPDATED":
      return "Besuchsanmerkung aktualisiert";
    case "SIBE_VISITOR_SEARCH":
      return "Besucher gesucht";
    case "SIBE_USER_SEARCH":
      return "Benutzer gesucht";
    default:
      return action;
  }
}

export function getNextStepHint(visit: VisitDetail): string {
  if (visit.status === "pre_registered") {
    if (visit.approvalStatus === "pending") {
      return "Nächster Schritt: SiBe-Freigabe abwarten";
    }
    if (visit.approvalStatus === "rejected") {
      return "Nächster Schritt: Ablehnung prüfen und Besuch korrigieren";
    }
    return visit.completeness.canCheckIn
      ? "Nächster Schritt: Daten prüfen und einchecken"
      : "Nächster Schritt: Fehlende Pflichtdaten ergänzen";
  }
  if (visit.status === "checked_in") {
    return "Nächster Schritt: Ansprechpartner-Bestätigung einholen und danach auschecken";
  }
  if (visit.status === "checked_out") {
    return "Besuch abgeschlossen";
  }
  return "Keine operative Aktion verfügbar";
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
      return "Sicherheitshinweise";
    case "photo_ban":
      return "Fotografierverbot";
    case "signature_notice":
      return "Rückgabe und Unterschrift";
    case "visitor_notice":
      return "Hinweis für Besucher";
    case "footer":
      return "Footer";
    case "custom":
      return "Benutzerdefinierter Bereich";
    default:
      return textType
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

export function getAllowedMenuAccessForRole(role: User["role"]): AppMenuKey[] {
  return [...allowedMenuAccessByRole[role]];
}

export function getEffectiveMenuAccess(user: User | AdminUser | null | undefined): AppMenuKey[] {
  if (!user) {
    return [];
  }

  if (user.menuAccess?.length) {
    return user.menuAccess;
  }

  return getAllowedMenuAccessForRole(user.role);
}

export function getEffectivePermissions(user: User | AdminUser | null | undefined): UserPermissions {
  if (!user) {
    return createEmptyPermissions();
  }

  return user.permissions ?? getDefaultPermissionsForRole(user.role);
}

export function hasPermission(user: User | AdminUser | null | undefined, permission: AppPermission): boolean {
  if (!user) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  const [section, key] = permission.split(".") as [keyof UserPermissions, string];
  const sectionValue = getEffectivePermissions(user)[section] as Record<string, boolean>;
  return Boolean(sectionValue[key]);
}

export function hasMenuAccess(user: User | AdminUser | null | undefined, menuKey: AppMenuKey): boolean {
  return getEffectiveMenuAccess(user).includes(menuKey);
}

export function getDefaultRouteForUser(user: User): string {
  if (hasMenuAccess(user, "admin") && (hasPermission(user, "admin.users") || hasPermission(user, "admin.guards") || hasPermission(user, "admin.fields") || hasPermission(user, "admin.map") || hasPermission(user, "admin.system") || hasPermission(user, "logs.audit") || hasPermission(user, "logs.errors"))) {
    return "/admin";
  }
  if (hasMenuAccess(user, "wache") && hasPermission(user, "visits.read")) {
    return "/wache";
  }
  if (hasMenuAccess(user, "genehmigung") && hasPermission(user, "approvals.read")) {
    return "/genehmigungen";
  }
  if (hasMenuAccess(user, "sibe") && hasPermission(user, "dashboards.sibe")) {
    return "/sibe";
  }
  if (hasMenuAccess(user, "kaskdt") && hasPermission(user, "dashboards.commander")) {
    return "/kaskdt";
  }
  if (hasMenuAccess(user, "texte") && hasPermission(user, "admin.texts")) {
    return "/texte";
  }
  if (hasMenuAccess(user, "voranmeldung")) {
    return "/";
  }
  return "/";
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
    gateId: "",
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
    idDocumentType: "",
    idDocumentValidUntil: "",
    idDocumentNumber: "",
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
      const response = await fetchJson<{ user: User | null }>("/api/auth/me", {
        method: "GET",
        headers: {}
      });

      setUser(response.user ?? null);
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
  const [backgroundMode, setBackgroundMode] = useState<"image" | "subtle" | "plain">(() => {
    return "plain";
  });
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>(BRANDING.background);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    window.localStorage.setItem("bm-theme", mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.setAttribute("data-background", backgroundMode);
  }, [backgroundMode]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--body-background-source",
      backgroundImageUrl ? `url("${backgroundImageUrl}")` : "none"
    );
  }, [backgroundImageUrl]);

  useEffect(() => {
    let active = true;

    void fetchJson<{ backgroundMode: "image" | "subtle" | "plain"; backgroundImageUrl: string }>("/api/ui-settings", {
      method: "GET",
      headers: {}
    }).then((payload) => {
      if (!active) return;
      setBackgroundMode(payload.backgroundMode);
      setBackgroundImageUrl(payload.backgroundImageUrl || "");
    }).catch(() => {
    });

    return () => {
      active = false;
    };
  }, []);

  const toggle = useCallback(() => {
    setMode((current) => (current === "light" ? "dark" : "light"));
  }, []);

  return <ThemeContext.Provider value={{ mode, toggle, backgroundMode, setBackgroundMode, setBackgroundImageUrl }}>{children}</ThemeContext.Provider>;
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
  const menuItems: Array<{ to: string; label: string; visible: boolean }> = [
    { to: "/", label: "Voranmeldung", visible: !user || Boolean(user && hasMenuAccess(user, "voranmeldung")) },
    { to: "/wache", label: "Wache", visible: Boolean(user && hasMenuAccess(user, "wache") && hasPermission(user, "visits.read")) },
    { to: "/import", label: "Import", visible: Boolean(!user || (user && hasMenuAccess(user, "import") && hasPermission(user, "imports.execute"))) },
    { to: "/admin", label: "Admin", visible: Boolean(user && hasMenuAccess(user, "admin") && (hasPermission(user, "admin.users") || hasPermission(user, "admin.guards") || hasPermission(user, "admin.fields") || hasPermission(user, "admin.map") || hasPermission(user, "admin.system") || hasPermission(user, "logs.audit") || hasPermission(user, "logs.errors"))) },
    { to: "/genehmigungen", label: "Genehmigungen", visible: Boolean(user && hasMenuAccess(user, "genehmigung") && hasPermission(user, "approvals.read")) },
    { to: "/sibe", label: "SiBe", visible: Boolean(user && hasMenuAccess(user, "sibe") && hasPermission(user, "dashboards.sibe")) },
    { to: "/kaskdt", label: "KasKdt", visible: Boolean(user && hasMenuAccess(user, "kaskdt") && hasPermission(user, "dashboards.commander")) },
    { to: "/texte", label: "Texte", visible: Boolean(user && hasMenuAccess(user, "texte") && hasPermission(user, "admin.texts")) },
    { to: "/login", label: "Login", visible: !user }
  ];

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="shell app-shell">
      <div className="content-container">
        <header className="topbar app-header">
          <div className="topbar-branding">
            <div className="brand-wrap">
              <img className="brand-logo" src={BRANDING.logo} alt="WIWeB" />
            </div>

            <div className="title-wrap">
              <h1>Besucher Manager</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <nav className="nav-links">
              {menuItems.filter((item) => item.visible).map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active-link" : "")}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <button className="secondary-button" type="button" onClick={toggle}>
              {mode === "dark" ? "Hell" : "Dunkel"}
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
  redirectTo = "/login",
  requiredMenuKey,
  requiredMenuKeys,
  requiredPermissions
}: PropsWithChildren<{ allowedRoles: User["role"][]; redirectTo?: string; requiredMenuKey?: AppMenuKey; requiredMenuKeys?: AppMenuKey[]; requiredPermissions?: AppPermission[] }>) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const allowCustomByPermission = user.role === "custom" && Boolean(requiredPermissions?.length);

  if (!allowedRoles.includes(user.role) && !allowCustomByPermission) {
    return <Navigate to={redirectTo} replace />;
  }

  const neededMenuKeys = requiredMenuKeys?.length
    ? requiredMenuKeys
    : requiredMenuKey
      ? [requiredMenuKey]
      : [];

  if (neededMenuKeys.length > 0 && !neededMenuKeys.some((menuKey) => hasMenuAccess(user, menuKey))) {
    return <Navigate to={redirectTo} replace />;
  }

  if (requiredPermissions?.length && !requiredPermissions.some((permission) => hasPermission(user, permission))) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
