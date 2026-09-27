import type { AuthUser } from "@/lib/auth";

export const INITIAL_AGENCY_ID = "00000000-0000-4000-8000-000000000001";
export type UserRole = "super_admin" | "agency_admin" | "agency_user";

export function isSuperAdmin(user: Pick<AuthUser, "role">) {
  return user.role === "super_admin";
}

export function isAgencyManager(user: Pick<AuthUser, "role">) {
  return user.role === "super_admin" || user.role === "agency_admin";
}

export function canAccessAgency(user: Pick<AuthUser, "role" | "agencyId">, agencyId: string) {
  return isSuperAdmin(user) || user.agencyId === agencyId;
}

export function canManageTenantUser(
  actor: Pick<AuthUser, "role" | "agencyId">,
  target: { role: UserRole; agencyId: string | null },
) {
  if (isSuperAdmin(actor)) return true;
  return actor.role === "agency_admin" && target.role !== "super_admin" && actor.agencyId === target.agencyId;
}

export function stateIdForAgency(agencyId: string) {
  return agencyId === INITIAL_AGENCY_ID ? "primary" : `agency:${agencyId}`;
}
