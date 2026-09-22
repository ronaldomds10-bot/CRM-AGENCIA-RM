import type { AuthUser } from "@/lib/auth";

export const RECORD_KEYS = ["quotes", "clients", "suppliers", "events"] as const;
export type RecordKey = (typeof RECORD_KEYS)[number];
type CRMRecord = { id: string; ownerId?: string; assignedUserId?: string | null; [key: string]: unknown };
export type StatePayload = { [key: string]: unknown } & { quotes: CRMRecord[]; clients: CRMRecord[]; suppliers: CRMRecord[]; events: CRMRecord[] };

export function canAccessRecord(record: CRMRecord, user: AuthUser) {
  return user.role === "admin" || (record.ownerId || "admin") === user.id || record.assignedUserId === user.id;
}

export function visibleState(state: StatePayload, user: AuthUser): StatePayload {
  if (user.role === "admin") return state;
  return Object.fromEntries(Object.entries(state).filter(([key]) => [...RECORD_KEYS, "settings"].includes(key)).map(([key, value]) =>
    RECORD_KEYS.includes(key as RecordKey)
      ? [key, Array.isArray(value) ? value.filter((record) => canAccessRecord(record, user)) : []]
      : [key, value],
  )) as StatePayload;
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
  return result;
}
