import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getPool } from "@/lib/db";

export const SESSION_COOKIE = "rm_crm_session";
export type AuthUser = { id: string; email: string; name: string; role: "admin" | "user" };

export function authConfigured() {
  return Boolean(process.env.CRM_ADMIN_EMAIL && process.env.CRM_ACCESS_PASSWORD && process.env.DATABASE_URL);
}

function valuesMatch(value: string, expected: string) {
  const supplied = Buffer.from(value);
  const target = Buffer.from(expected);
  return supplied.length === target.length && timingSafeEqual(supplied, target);
}

export function adminCredentialsMatch(email: string, password: string) {
  const expectedEmail = (process.env.CRM_ADMIN_EMAIL || "").trim().toLowerCase();
  const expectedPassword = process.env.CRM_ACCESS_PASSWORD || "";
  return valuesMatch(email.trim().toLowerCase(), expectedEmail)
    && valuesMatch(password, expectedPassword);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [salt, hex] = stored.split(":");
  if (!salt || !/^[0-9a-f]{128}$/.test(hex || "")) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hex, "hex"));
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await getPool().query("INSERT INTO crm_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')", [tokenHash(token), userId]);
  return token;
}

export async function revokeSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await getPool().query("DELETE FROM crm_sessions WHERE token_hash = $1", [tokenHash(token)]);
}

export async function getSessionUser(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;
  const result = await getPool().query(
    `SELECT u.id, u.email, u.name, u.role FROM crm_sessions s
     JOIN crm_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE`,
    [tokenHash(token)],
  );
  return result.rows[0] ?? null;
}

export async function isAuthorized(request: NextRequest) {
  return Boolean(await getSessionUser(request));
}
