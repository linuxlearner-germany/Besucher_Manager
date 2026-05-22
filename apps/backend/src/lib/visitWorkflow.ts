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

export type VisitStatus = (typeof VISIT_STATUS)[keyof typeof VISIT_STATUS] | "vorangemeldet" | "eingecheckt" | "ausgecheckt";
export type HostSignatureStatus = (typeof HOST_SIGNATURE_STATUS)[keyof typeof HOST_SIGNATURE_STATUS];

export type AppRole = "admin" | "guard" | "sibe";

export type AuthenticatedUser = {
  id: string;
  username: string;
  role: AppRole;
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

export function canAccessGate(user: AuthenticatedUser, gateId: string): boolean {
  if (user.role === "admin") {
    return true;
  }

  return Boolean(user.gateId && user.gateId === gateId);
}
