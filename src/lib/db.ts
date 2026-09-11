import { Pool } from "pg";

declare global {
  var crmPgPool: Pool | undefined;
}

function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL não configurada.");
  return value;
}

export function getPool() {
  if (!globalThis.crmPgPool) {
    const connectionString = databaseUrl();
    const railwayPublicProxy = connectionString.includes(".proxy.rlwy.net");
    globalThis.crmPgPool = new Pool({
      connectionString,
      ssl: railwayPublicProxy ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalThis.crmPgPool;
}

export async function ensureSchema() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS crm_state (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
