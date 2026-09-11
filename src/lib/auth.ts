import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "rm_crm_session";

function secret() {
  return process.env.CRM_AUTH_SECRET || "";
}

export function authConfigured() {
  return Boolean(process.env.CRM_ACCESS_PASSWORD && secret());
}

export function passwordsMatch(password: string) {
  const expected = process.env.CRM_ACCESS_PASSWORD || "";
  const supplied = Buffer.from(password);
  const target = Buffer.from(expected);
  return supplied.length === target.length && timingSafeEqual(supplied, target);
}

export function sessionToken() {
  return createHmac("sha256", secret()).update("rm-partiu-crm:v1").digest("base64url");
}

export function isAuthorized(request: NextRequest) {
  if (!authConfigured()) return process.env.NODE_ENV !== "production";
  const value = request.cookies.get(SESSION_COOKIE)?.value || "";
  const supplied = Buffer.from(value);
  const target = Buffer.from(sessionToken());
  return supplied.length === target.length && timingSafeEqual(supplied, target);
}
