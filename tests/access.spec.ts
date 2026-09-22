import { test, expect } from "@playwright/test";
import { mergeState, visibleState, type StatePayload } from "../src/lib/access";

const admin = { id: "admin", email: "admin@example.com", name: "Admin", role: "admin" as const };
const user = { id: "user-1", email: "user@example.com", name: "User", role: "user" as const };
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
