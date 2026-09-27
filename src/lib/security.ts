import "server-only";
import type { NextRequest } from "next/server";

export const CSRF_HEADER = "x-rm-csrf";

export class RequestInputError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export function isTrustedMutation(request: NextRequest) {
  if (request.headers.get(CSRF_HEADER) !== "1") return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function readJsonBody<T>(request: NextRequest, maxBytes = 64 * 1024): Promise<T> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) throw new RequestInputError("Conteúdo inválido.", 415);
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) throw new RequestInputError("Conteúdo muito grande.", 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new RequestInputError("Conteúdo muito grande.", 413);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new RequestInputError("JSON inválido.");
  }
}
