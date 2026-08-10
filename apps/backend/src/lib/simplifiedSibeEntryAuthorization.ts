import { hasPermission, type AuthenticatedUser } from "./visitWorkflow";

export function canCreateSimplifiedSibeEntry(user: Pick<AuthenticatedUser, "role" | "permissions"> | null | undefined): boolean {
  return Boolean(user?.role === "sibe" && hasPermission(user, "visits.create"));
}
