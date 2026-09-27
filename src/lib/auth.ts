import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { ensureTenantSchema, getPool } from "@/lib/db";
import { INITIAL_AGENCY_ID, type UserRole } from "@/lib/tenant";

export const SESSION_COOKIE = "rm_crm_session";
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  agencyId: string | null;
  agencyName: string | null;
  dataAgencyId: string;
};

export function authConfigured() {
  return Boolean(process.env.DATABASE_URL);
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

let authSchemaPromise: Promise<void> | null = null;

async function ensureAuthSecuritySchema() {
  if (!authSchemaPromise) {
    authSchemaPromise = ensureTenantSchema().then(() => getPool().query(`
      CREATE TABLE IF NOT EXISTS crm_login_attempts (
        key_hash TEXT PRIMARY KEY,
        attempt_count INTEGER NOT NULL,
        reset_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS crm_login_attempts_reset_idx ON crm_login_attempts (reset_at)
    `)).then(() => undefined).catch((error) => {
      authSchemaPromise = null;
      throw error;
    });
  }
  await authSchemaPromise;
}

function attemptKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function allowLoginAttempt(keys: string[], limit: number, windowMs: number) {
  await ensureAuthSecuritySchema();
  const hashes = keys.map(attemptKey);
  const results = await Promise.all(hashes.map((key) => getPool().query(
    `INSERT INTO crm_login_attempts (key_hash, attempt_count, reset_at)
     VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 millisecond'))
     ON CONFLICT (key_hash) DO UPDATE SET
       attempt_count = CASE WHEN crm_login_attempts.reset_at <= NOW() THEN 1 ELSE LEAST(crm_login_attempts.attempt_count + 1, $3 + 1) END,
       reset_at = CASE WHEN crm_login_attempts.reset_at <= NOW() THEN NOW() + ($2 * INTERVAL '1 millisecond') ELSE crm_login_attempts.reset_at END
     RETURNING attempt_count <= $3 AS allowed`,
    [key, windowMs, limit],
  )));
  return { allowed: results.every((result) => result.rows[0]?.allowed === true), hashes };
}

export async function clearLoginAttempts(hashes: string[]) {
  if (!hashes.length) return;
  await getPool().query("DELETE FROM crm_login_attempts WHERE key_hash = ANY($1::text[])", [hashes]);
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
  await ensureTenantSchema();
  const result = await getPool().query(
    `SELECT u.id, u.email, u.name, u.tenant_role AS role, u.agency_id AS "agencyId", a.name AS "agencyName" FROM crm_sessions s
     JOIN crm_users u ON u.id = s.user_id
     LEFT JOIN agencies a ON a.id = u.agency_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE
       AND (u.tenant_role = 'super_admin' OR a.active = TRUE)`,
    [tokenHash(token)],
  );
  const user = result.rows[0] as Omit<AuthUser, "dataAgencyId"> | undefined;
  return user ? { ...user, dataAgencyId: user.agencyId || INITIAL_AGENCY_ID } : null;
}

export async function isAuthorized(request: NextRequest) {
  return Boolean(await getSessionUser(request));
}
