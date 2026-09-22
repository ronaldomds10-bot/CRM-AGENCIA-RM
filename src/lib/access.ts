import type { AuthUser } from "@/lib/auth";

export const RECORD_KEYS = ["quotes", "clients", "suppliers", "events"] as const;
export type RecordKey = (typeof RECORD_KEYS)[number];
type CRMRecord = { id: string; ownerId?: string; assignedUserId?: string | null; [key: string]: unknown };
export type StatePayload = { [key: string]: unknown } & { quotes: CRMRecord[]; clients: CRMRecord[]; suppliers: CRMRecord[]; events: CRMRecord[] };

export function canAccessRecord(record: CRMRecord, user: AuthUser) {
  return user.role === "admin" || (record.ownerId || "admin") === user.id || record.assignedUserId === user.id;
}

export function settingsForUser(state: StatePayload, user: AuthUser) {
  const agency = (state.settings || {}) as Record<string, unknown>;
  if (user.role === "admin") return agency;
  const saved = (state.userSettings as Record<string, Record<string, unknown>> | undefined)?.[user.id];
  return saved || {
    contactName: user.name,
    contactEmail: user.email,
    contactPhone: "",
    companyName: "",
    document: "",
    instagram: "",
    address: "",
    logoDataUrl: "",
    currency: agency.currency || "BRL",
    installmentRates: Array.isArray(agency.installmentRates) ? agency.installmentRates : Array(12).fill(0),
  };
}

export function visibleState(state: StatePayload, user: AuthUser): StatePayload {
  if (user.role === "admin") return state;
  return {
    quotes: state.quotes.filter((record) => canAccessRecord(record, user)),
    clients: state.clients.filter((record) => canAccessRecord(record, user)),
    suppliers: state.suppliers.filter((record) => canAccessRecord(record, user)),
    events: state.events.filter((record) => canAccessRecord(record, user)),
    settings: settingsForUser(state, user),
  };
}

export function mergeState(current: StatePayload, incoming: StatePayload, user: AuthUser): StatePayload {
  const result = { ...current };
  for (const key of RECORD_KEYS) {
    const before = Array.isArray(current[key]) ? current[key] : [];
    const submitted = incoming[key];
    if (!Array.isArray(submitted)) throw new Error(`Lista ${key} inválida.`);
    const byId = new Map(before.map((record) => [record.id, record]));
    const seen = new Set<string>();
    const next = submitted.map((record) => {
      if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id || seen.has(record.id)) throw new Error(`Registro ${key} inválido.`);
      seen.add(record.id);
      const old = byId.get(record.id);
      if (old && !canAccessRecord(old, user)) throw new Error("Registro não autorizado.");
      if (user.role === "user") {
        if (record.ownerId && record.ownerId !== (old?.ownerId || (old ? "admin" : user.id))) throw new Error("Proprietário não autorizado.");
        if (record.assignedUserId && record.assignedUserId !== old?.assignedUserId) throw new Error("Atribuição não autorizada.");
      }
      return {
        ...record,
        ownerId: old?.ownerId || (old ? "admin" : user.id),
        assignedUserId: user.role === "admin" ? record.assignedUserId ?? old?.assignedUserId ?? null : old?.assignedUserId ?? null,
      };
    });
    if (user.role === "admin") {
      result[key] = next;
    } else {
      const missingAssigned = before.some((record) => record.assignedUserId === user.id && record.ownerId !== user.id && !seen.has(record.id));
      if (missingAssigned) throw new Error("Somente o proprietário pode excluir um registro atribuído.");
      result[key] = [...before.filter((record) => !canAccessRecord(record, user)), ...next];
    }
  }
  if (user.role === "admin") result.settings = incoming.settings ?? current.settings;
  else {
    const settings = incoming.settings as Record<string, unknown> | undefined;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Configurações inválidas.");
    const fields = ["contactName", "contactEmail", "contactPhone", "companyName", "document", "instagram", "address", "logoDataUrl"] as const;
    const own = Object.fromEntries(fields.map((field) => [field, typeof settings[field] === "string" ? settings[field] : ""]));
    if (fields.some((field) => (own[field] as string).length > (field === "logoDataUrl" ? 2_000_000 : 500))) throw new Error("Configurações inválidas.");
    const rates = settings.installmentRates;
    if (!Array.isArray(rates) || rates.length > 24 || rates.some((rate) => typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100)) throw new Error("Taxas inválidas.");
    result.userSettings = {
      ...((current.userSettings && typeof current.userSettings === "object" && !Array.isArray(current.userSettings)) ? current.userSettings as Record<string, unknown> : {}),
      [user.id]: { ...own, currency: ["BRL", "USD", "EUR"].includes(String(settings.currency)) ? settings.currency : "BRL", installmentRates: rates },
    };
  }
  return result;
}
