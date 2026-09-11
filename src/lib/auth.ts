import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "rm_crm_session";

function secret() {
  return process.env.CRM_AUTH_SECRET || "";
}

export function authConfigured() {
  return Boolean(process.env.CRM_ADMIN_EMAIL && process.env.CRM_ACCESS_PASSWORD && secret());
}

function valuesMatch(value: string, expected: string) {
  const supplied = Buffer.from(value);
  const target = Buffer.from(expected);
  return supplied.length === target.length && timingSafeEqual(supplied, target);
}

export function credentialsMatch(email: string, password: string) {
  const expectedEmail = (process.env.CRM_ADMIN_EMAIL || "").trim().toLocaleLowerCase("pt-BR");
  const expectedPassword = process.env.CRM_ACCESS_PASSWORD || "";
  return valuesMatch(email.trim().toLocaleLowerCase("pt-BR"), expectedEmail)
    && valuesMatch(password, expectedPassword);
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
