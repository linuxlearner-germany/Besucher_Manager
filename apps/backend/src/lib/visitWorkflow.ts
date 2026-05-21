export const VISIT_STATUS = {
  PRE_REGISTERED: "pre_registered",
  CHECKED_IN: "checked_in",
  CHECKED_OUT: "checked_out",
  CANCELLED: "cancelled"
} as const;

export type VisitStatus = (typeof VISIT_STATUS)[keyof typeof VISIT_STATUS] | "vorangemeldet" | "eingecheckt" | "ausgecheckt";

export type GuardRole = "admin" | "guard";

export type AuthenticatedUser = {
  id: string;
  username: string;
  role: GuardRole;
  gateId: string | null;
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

export function assertCanCheckOut(status: string, signedByHostConfirmed: boolean): void {
  const normalized = normalizeVisitStatus(status);

  if (normalized !== VISIT_STATUS.CHECKED_IN) {
    throw new Error("invalid_check_out_status");
  }

  if (!signedByHostConfirmed) {
    throw new Error("host_signature_required");
  }
}

export function canAccessGate(user: AuthenticatedUser, gateId: string): boolean {
  if (user.role === "admin") {
    return true;
  }

  return Boolean(user.gateId && user.gateId === gateId);
}
