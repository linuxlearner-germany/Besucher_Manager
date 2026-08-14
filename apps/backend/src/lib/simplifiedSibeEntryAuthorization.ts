import { hasRole, type AuthenticatedUser } from "./visitWorkflow";

export function canCreateSimplifiedSibeEntry(user: Pick<AuthenticatedUser, "role" | "roles"> | null | undefined): boolean {
  return Boolean(user && hasRole(user, "sibe"));
}
