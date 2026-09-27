import { test, expect } from "@playwright/test";
import { mergeState, visibleState, type StatePayload } from "../src/lib/access";
import { canAccessAgency, canManageTenantUser } from "../src/lib/tenant";

const agencyA = "10000000-0000-4000-8000-000000000001";
const agencyB = "20000000-0000-4000-8000-000000000002";
const admin = { id: "admin-a", email: "admin@example.com", name: "Admin", role: "agency_admin" as const, agencyId: agencyA, agencyName: "A", dataAgencyId: agencyA };
const user = { id: "user-1", email: "user@example.com", name: "User", role: "agency_user" as const, agencyId: agencyA, agencyName: "A", dataAgencyId: agencyA };
const state = (): StatePayload => ({
  quotes: [{ id: "legacy", name: "Antigo" }, { id: "owned", ownerId: user.id }, { id: "assigned", ownerId: admin.id, assignedUserId: user.id }],
  clients: [{ id: "private", ownerId: admin.id }],
  suppliers: [],
  events: [],
  settings: { companyName: "RM" },
});

test("usuário lê apenas registros próprios ou atribuídos", () => {
  expect(visibleState(state(), user).quotes.map((item) => item.id)).toEqual(["owned", "assigned"]);
  expect(visibleState(state(), user).clients).toEqual([]);
  expect(visibleState(state(), admin).quotes).toHaveLength(3);
});

test("gravação do usuário mantém registros alheios e configurações", () => {
  const submitted = visibleState(state(), user);
  submitted.quotes[0].name = "Atualizado";
  submitted.quotes.push({ id: "new" });
  submitted.settings = { ...(submitted.settings as object), companyName: "Empresa do usuário" };
  const result = mergeState(state(), submitted, user);
  expect(result.quotes.find((item) => item.id === "legacy")?.ownerId).toBeUndefined();
  expect(result.quotes.find((item) => item.id === "new")?.ownerId).toBe(user.id);
  expect(result.settings).toEqual({ companyName: "RM" });
  expect((result.userSettings as Record<string, { companyName: string }>)[user.id].companyName).toBe("Empresa do usuário");
  expect((visibleState(result, user).settings as { companyName: string }).companyName).toBe("Empresa do usuário");
  expect(visibleState(result, { ...user, id: "user-2" }).userSettings).toBeUndefined();
});

test("agência A não acessa nem gerencia a agência B", () => {
  const adminB = { role: "agency_admin" as const, agencyId: agencyB };
  const userB = { role: "agency_user" as const, agencyId: agencyB };
  expect(canAccessAgency(admin, agencyB)).toBe(false);
  expect(canAccessAgency(user, agencyB)).toBe(false);
  expect(canManageTenantUser(admin, userB)).toBe(false);
  expect(canManageTenantUser(admin, { role: "agency_user", agencyId: agencyA })).toBe(true);
  expect(canManageTenantUser(adminB, { role: "agency_user", agencyId: agencyA })).toBe(false);
});

test("usuário não altera registros alheios nem atribuições", () => {
  const submitted = visibleState(state(), user);
  submitted.quotes.push({ id: "legacy" });
  expect(() => mergeState(state(), submitted, user)).toThrow();
  const spoofed = visibleState(state(), user);
  spoofed.quotes[0].assignedUserId = "user-2";
  expect(() => mergeState(state(), spoofed, user)).toThrow();
  const deletion = visibleState(state(), user);
  deletion.quotes = deletion.quotes.filter((item) => item.id !== "assigned");
  expect(() => mergeState(state(), deletion, user)).toThrow();
});
