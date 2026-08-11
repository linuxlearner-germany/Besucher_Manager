import type { AuthenticatedUser } from "./visitWorkflow";

export function canCreateSimplifiedSibeEntry(user: Pick<AuthenticatedUser, "role"> | null | undefined): boolean {
  return user?.role === "sibe";
}
