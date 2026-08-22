import crypto from "node:crypto";

export const SIMPLIFIED_ENTRY_STATUSES = ["pending", "approved", "rejected", "revoked"] as const;
export type SimplifiedEntryStatus = (typeof SIMPLIFIED_ENTRY_STATUSES)[number];
export type SimplifiedRequestStatus = "pending" | "partially_approved" | "approved" | "rejected" | "completed";

export function deriveSimplifiedRequestStatus(statuses: readonly SimplifiedEntryStatus[]): SimplifiedRequestStatus {
  if (!statuses.length || statuses.every((status) => status === "pending")) return "pending";
  if (statuses.every((status) => status === "approved")) return "approved";
  if (statuses.every((status) => status === "rejected")) return "rejected";
  if (statuses.some((status) => status === "pending")) return "partially_approved";
  return "completed";
}

export function generateSimplifiedRegistrationToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

export function hashSimplifiedRegistrationToken(token: string): string {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is required");
  return crypto.createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

export function verifySimplifiedRegistrationToken(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSimplifiedRegistrationToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function buildSimplifiedRequestNumber(sequence: number, now = new Date()): string {
  return `VM-${now.getUTCFullYear()}-${String(sequence).padStart(6, "0")}`;
}
