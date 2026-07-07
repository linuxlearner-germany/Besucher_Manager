export const VISIT_STATUS = {
  PRE_REGISTERED: "pre_registered",
  CHECKED_IN: "checked_in",
  CHECKED_OUT: "checked_out",
  CANCELLED: "cancelled"
} as const;

export const HOST_SIGNATURE_STATUS = {
  NOT_REQUIRED: "not_required",
  PENDING: "pending",
  SIGNED_SAME_DAY: "signed_same_day",
  SIGNED_LATER: "signed_later",
  MISSING_EXCEPTION: "missing_exception"
} as const;

export const APPROVAL_STATUS = {
  NOT_REQUIRED: "not_required",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
} as const;

export type VisitStatus = (typeof VISIT_STATUS)[keyof typeof VISIT_STATUS] | "vorangemeldet" | "eingecheckt" | "ausgecheckt";
export type HostSignatureStatus = (typeof HOST_SIGNATURE_STATUS)[keyof typeof HOST_SIGNATURE_STATUS];
export type ApprovalStatus = (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

export type AppRole = "admin" | "guard" | "sibe" | "kaskdt" | "custom";
export const APP_MENU_KEYS = ["voranmeldung", "wache", "import", "admin", "genehmigung", "sibe", "kaskdt", "texte"] as const;
export type AppMenuKey = (typeof APP_MENU_KEYS)[number];

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

export type UserPermissionsInput = {
  menu?: Partial<UserPermissions["menu"]>;
  visits?: Partial<UserPermissions["visits"]>;
  imports?: Partial<UserPermissions["imports"]>;
  approvals?: Partial<UserPermissions["approvals"]>;
  dashboards?: Partial<UserPermissions["dashboards"]>;
  admin?: Partial<UserPermissions["admin"]>;
  logs?: Partial<UserPermissions["logs"]>;
};

export const APP_PERMISSION_KEYS = [
  "visits.read",
  "visits.create",
  "visits.update",
  "visits.delete",
  "visits.checkIn",
  "visits.checkOut",
  "visits.printBadge",
  "imports.execute",
  "approvals.read",
  "approvals.review",
  "approvals.approve",
  "approvals.reject",
  "dashboards.sibe",
  "dashboards.commander",
  "admin.users",
  "admin.guards",
  "admin.texts",
  "admin.map",
  "admin.fields",
  "admin.system",
  "logs.audit",
  "logs.errors"
] as const;

export type AppPermission = (typeof APP_PERMISSION_KEYS)[number];

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

function withAllPermissions(): UserPermissions {
  return {
    menu: {
      preRegistration: true,
      guard: true,
      import: true,
      admin: true,
      approvals: true,
      sibe: true,
      commander: true,
      texts: true
    },
    visits: {
      read: true,
      create: true,
      update: true,
      delete: true,
      checkIn: true,
      checkOut: true,
      printBadge: true
    },
    imports: {
      execute: true
    },
    approvals: {
      read: true,
      review: true,
      approve: true,
      reject: true
    },
    dashboards: {
      sibe: true,
      commander: true
    },
    admin: {
      users: true,
      guards: true,
      texts: true,
      map: true,
      fields: true,
      system: true
    },
    logs: {
      audit: true,
      errors: true
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

const defaultMenuAccessByRole: Record<AppRole, AppMenuKey[]> = {
  admin: [...APP_MENU_KEYS],
  guard: ["voranmeldung", "wache", "import"],
  sibe: ["genehmigung", "sibe", "import"],
  kaskdt: ["kaskdt"],
  custom: []
};

const allowedMenuAccessByRole: Record<AppRole, AppMenuKey[]> = {
  admin: [...APP_MENU_KEYS],
  guard: ["voranmeldung", "wache", "import"],
  sibe: ["import", "genehmigung", "sibe"],
  kaskdt: ["kaskdt"],
  custom: [...APP_MENU_KEYS]
};

export function getDefaultMenuAccessForRole(role: AppRole): AppMenuKey[] {
  return [...defaultMenuAccessByRole[role]];
}

export function getAllowedMenuAccessForRole(role: AppRole): AppMenuKey[] {
  return [...allowedMenuAccessByRole[role]];
}

export function getDefaultPermissionsForRole(role: AppRole): UserPermissions {
  switch (role) {
    case "admin":
      return withAllPermissions();
    case "guard":
      return mergePermissions(createEmptyPermissions(), {
        menu: {
          preRegistration: true,
          guard: true,
          import: true,
          admin: false,
          approvals: false,
          sibe: false,
          commander: false,
          texts: false
        },
        visits: {
          read: true,
          create: true,
          update: true,
          delete: false,
          checkIn: true,
          checkOut: true,
          printBadge: true
        },
        imports: {
          execute: true
        }
      });
    case "sibe":
      return mergePermissions(createEmptyPermissions(), {
        menu: {
          preRegistration: false,
          guard: false,
          import: true,
          approvals: true,
          sibe: true,
          admin: false,
          commander: false,
          texts: false
        },
        visits: {
          read: true,
          create: true,
          update: true,
          delete: false,
          checkIn: false,
          checkOut: false,
          printBadge: false
        },
        imports: {
          execute: true
        },
        approvals: {
          read: true,
          review: true,
          approve: true,
          reject: true
        },
        dashboards: {
          sibe: true,
          commander: false
        }
      });
    case "kaskdt":
      return mergePermissions(createEmptyPermissions(), {
        menu: {
          preRegistration: false,
          guard: false,
          import: false,
          admin: false,
          approvals: false,
          sibe: false,
          commander: true,
          texts: false
        },
        visits: {
          read: true,
          create: false,
          update: false,
          delete: false,
          checkIn: false,
          checkOut: false,
          printBadge: false
        },
        approvals: {
          read: true,
          review: false,
          approve: false,
          reject: false
        },
        dashboards: {
          sibe: false,
          commander: true
        }
      });
    case "custom":
      return createEmptyPermissions();
  }
}

export function normalizeUserPermissions(
  role: AppRole,
  permissions: UserPermissionsInput | null | undefined,
  menuAccess?: AppMenuKey[] | null
): UserPermissions {
  const normalized = role === "custom"
    ? mergePermissions(createEmptyPermissions(), permissions)
    : getDefaultPermissionsForRole(role);

  const nextMenuAccess = menuAccess ?? getDefaultMenuAccessForRole(role);
  normalized.menu.preRegistration = nextMenuAccess.includes("voranmeldung");
  normalized.menu.guard = nextMenuAccess.includes("wache");
  normalized.menu.import = nextMenuAccess.includes("import");
  normalized.menu.admin = nextMenuAccess.includes("admin");
  normalized.menu.approvals = nextMenuAccess.includes("genehmigung");
  normalized.menu.sibe = nextMenuAccess.includes("sibe");
  normalized.menu.commander = nextMenuAccess.includes("kaskdt");
  normalized.menu.texts = nextMenuAccess.includes("texte");

  return normalized;
}

export function parsePermissionsJson(value: string | null | undefined): UserPermissionsInput | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as Partial<UserPermissions>;
  } catch {
    return null;
  }
}

function readPermissionValue(permissions: UserPermissions, permission: AppPermission): boolean {
  const [section, key] = permission.split(".") as [keyof UserPermissions, string];
  const sectionValue = permissions[section] as Record<string, boolean>;
  return Boolean(sectionValue[key]);
}

export function hasPermission(user: Pick<AuthenticatedUser, "role" | "permissions">, permission: AppPermission): boolean {
  if (user.role === "admin") {
    return true;
  }

  return readPermissionValue(user.permissions, permission);
}

export type AuthenticatedUser = {
  id: string;
  username: string;
  role: AppRole;
  gateId: string | null;
  gateName?: string | null;
  groups: string[];
  menuAccess: AppMenuKey[];
  permissions: UserPermissions;
};

export type GuardScopedVisitTarget = {
  gateId: string | null;
  status: string;
};

export function normalizeVisitStatus(status: string): VisitStatus {
  switch (status) {
    case "vorangemeldet":
      return VISIT_STATUS.PRE_REGISTERED;
    case "eingecheckt":
      return VISIT_STATUS.CHECKED_IN;
    case "ausgecheckt":
      return VISIT_STATUS.CHECKED_OUT;
    default:
      return status as VisitStatus;
  }
}

export function assertCanCheckIn(status: string): void {
  const normalized = normalizeVisitStatus(status);

  if (normalized !== VISIT_STATUS.PRE_REGISTERED) {
    throw new Error("invalid_check_in_status");
  }
}

export function assertVisitApprovedForCheckIn(approvalStatus: string | null | undefined): void {
  const normalized = approvalStatus || APPROVAL_STATUS.NOT_REQUIRED;

  if (normalized === APPROVAL_STATUS.PENDING) {
    throw new Error("visit_approval_pending");
  }

  if (normalized === APPROVAL_STATUS.REJECTED) {
    throw new Error("visit_approval_rejected");
  }
}

export function assertCanCheckOut(
  status: string,
  signature: {
    status: HostSignatureStatus;
    signatureDate?: string | null;
    note?: string | null;
  }
): void {
  const normalized = normalizeVisitStatus(status);

  if (normalized !== VISIT_STATUS.CHECKED_IN) {
    throw new Error("invalid_check_out_status");
  }

  if (signature.status === HOST_SIGNATURE_STATUS.PENDING) {
    throw new Error("host_signature_required");
  }

  if (signature.status === HOST_SIGNATURE_STATUS.SIGNED_LATER && !signature.signatureDate) {
    throw new Error("host_signature_date_required");
  }

  if (signature.status === HOST_SIGNATURE_STATUS.MISSING_EXCEPTION && !signature.note?.trim()) {
    throw new Error("host_signature_note_required");
  }
}

export function assertReturnedBadgeNumberMatches(
  expectedBadgeNumber: string,
  returnedBadgeNumber: string
): void {
  const expected = expectedBadgeNumber.trim().toUpperCase();
  const returned = returnedBadgeNumber.trim().toUpperCase();

  if (!expected || !returned || expected !== returned) {
    throw new Error("returned_badge_number_mismatch");
  }
}

export function assertCanUpdateHostSignature(
  status: string,
  signature: {
    status: HostSignatureStatus;
    signatureDate?: string | null;
    note?: string | null;
  }
): void {
  const normalized = normalizeVisitStatus(status);

  if (normalized !== VISIT_STATUS.CHECKED_IN && normalized !== VISIT_STATUS.CHECKED_OUT) {
    throw new Error("invalid_signature_update_status");
  }

  if (signature.status === HOST_SIGNATURE_STATUS.SIGNED_LATER && !signature.signatureDate) {
    throw new Error("host_signature_date_required");
  }

  if (signature.status === HOST_SIGNATURE_STATUS.MISSING_EXCEPTION && !signature.note?.trim()) {
    throw new Error("host_signature_note_required");
  }
}

export function canAccessGate(user: AuthenticatedUser, gateId: string): boolean {
  if (user.role === "admin") {
    return true;
  }

  return Boolean(user.gateId && user.gateId === gateId);
}

export function canManageGuardScopedVisit(
  user: AuthenticatedUser,
  visit: GuardScopedVisitTarget,
  options?: { allowUnassignedPreRegistered?: boolean }
): boolean {
  if (visit.gateId) {
    return canAccessGate(user, visit.gateId);
  }

  if (!options?.allowUnassignedPreRegistered) {
    return false;
  }

  const normalizedStatus = normalizeVisitStatus(visit.status);

  if (normalizedStatus !== VISIT_STATUS.PRE_REGISTERED) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  return hasPermission(user, "visits.read") && Boolean(user.gateId);
}
