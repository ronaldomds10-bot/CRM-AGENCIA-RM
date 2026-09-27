import "server-only";
import { Pool } from "pg";
import { INITIAL_AGENCY_ID } from "@/lib/tenant";

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

let tenantSchemaPromise: Promise<void> | null = null;

export async function ensureTenantSchema() {
  if (!tenantSchemaPromise) {
    tenantSchemaPromise = (async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await client.query(`
      SELECT pg_advisory_xact_lock(826674621);
      CREATE TABLE IF NOT EXISTS crm_state (id TEXT PRIMARY KEY, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS shared_quotes (id UUID PRIMARY KEY, payload JSONB NOT NULL, quote_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS crm_users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
        active BOOLEAN NOT NULL DEFAULT TRUE, password_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS crm_users_email_idx ON crm_users (LOWER(email));
      CREATE TABLE IF NOT EXISTS crm_sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS agencies (
        id UUID PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS agencies_slug_idx ON agencies (LOWER(slug));
      INSERT INTO agencies (id, name, slug) VALUES ('${INITIAL_AGENCY_ID}', 'RM PARTIU VIAGENS', 'rm-partiu-viagens') ON CONFLICT (id) DO NOTHING;
      ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS tenant_role TEXT;
      ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS agency_id UUID;
      UPDATE crm_users SET tenant_role=CASE WHEN id='admin' THEN 'super_admin' WHEN role='admin' THEN 'agency_admin' ELSE 'agency_user' END
        WHERE tenant_role IS NULL OR tenant_role IN ('admin','user');
      UPDATE crm_users SET agency_id='${INITIAL_AGENCY_ID}' WHERE tenant_role<>'super_admin' AND agency_id IS NULL;
      UPDATE crm_users SET agency_id=NULL WHERE id='admin' AND tenant_role='super_admin';
      ALTER TABLE crm_users ALTER COLUMN tenant_role SET NOT NULL;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_users_tenant_role_check') THEN ALTER TABLE crm_users ADD CONSTRAINT crm_users_tenant_role_check CHECK (tenant_role IN ('super_admin','agency_admin','agency_user')); END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_users_agency_fk') THEN ALTER TABLE crm_users ADD CONSTRAINT crm_users_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies(id); END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS crm_users_agency_active_idx ON crm_users (agency_id, active);
      ALTER TABLE crm_state ADD COLUMN IF NOT EXISTS agency_id UUID;
      UPDATE crm_state SET agency_id='${INITIAL_AGENCY_ID}' WHERE id='primary' AND agency_id IS NULL;
      DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crm_state_agency_fk') THEN ALTER TABLE crm_state ADD CONSTRAINT crm_state_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies(id); END IF; END $$;
      CREATE UNIQUE INDEX IF NOT EXISTS crm_state_agency_idx ON crm_state (agency_id) WHERE agency_id IS NOT NULL;
      ALTER TABLE shared_quotes ADD COLUMN IF NOT EXISTS agency_id UUID;
      UPDATE shared_quotes SET agency_id='${INITIAL_AGENCY_ID}' WHERE agency_id IS NULL;
      DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='shared_quotes_agency_fk') THEN ALTER TABLE shared_quotes ADD CONSTRAINT shared_quotes_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies(id); END IF; END $$;
      CREATE INDEX IF NOT EXISTS shared_quotes_agency_quote_idx ON shared_quotes (agency_id, quote_id);
        `);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })().catch((error) => {
      tenantSchemaPromise = null;
      throw error;
    });
  }
  await tenantSchemaPromise;
}

export async function ensureSchema() {
  await ensureTenantSchema();
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS crm_state (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shared_quotes (
      id UUID PRIMARY KEY,
      payload JSONB NOT NULL,
      quote_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE shared_quotes ADD COLUMN IF NOT EXISTS quote_id TEXT;
    UPDATE shared_quotes SET quote_id = payload->'quote'->>'id'
      WHERE quote_id IS NULL AND payload->'quote'->>'id' IS NOT NULL;
    CREATE INDEX IF NOT EXISTS shared_quotes_created_at_idx ON shared_quotes (created_at);
    CREATE INDEX IF NOT EXISTS shared_quotes_quote_id_idx ON shared_quotes (quote_id)
  `);
}
