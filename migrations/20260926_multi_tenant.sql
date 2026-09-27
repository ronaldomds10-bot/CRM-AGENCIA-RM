BEGIN;
SELECT pg_advisory_xact_lock(826674621);

CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS agencies_slug_idx ON agencies (LOWER(slug));

INSERT INTO agencies (id, name, slug)
VALUES ('00000000-0000-4000-8000-000000000001', 'RM PARTIU VIAGENS', 'rm-partiu-viagens')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS tenant_role TEXT;
ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS agency_id UUID;
UPDATE crm_users SET tenant_role = CASE WHEN id = 'admin' THEN 'super_admin' WHEN role = 'admin' THEN 'agency_admin' ELSE 'agency_user' END
WHERE tenant_role IS NULL OR tenant_role IN ('admin', 'user');
UPDATE crm_users SET agency_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_role <> 'super_admin' AND agency_id IS NULL;
UPDATE crm_users SET agency_id = NULL WHERE id = 'admin' AND tenant_role = 'super_admin';
ALTER TABLE crm_users ALTER COLUMN tenant_role SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_users_tenant_role_check') THEN
    ALTER TABLE crm_users ADD CONSTRAINT crm_users_tenant_role_check CHECK (tenant_role IN ('super_admin','agency_admin','agency_user'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_users_agency_fk') THEN
    ALTER TABLE crm_users ADD CONSTRAINT crm_users_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS crm_users_agency_active_idx ON crm_users (agency_id, active);

ALTER TABLE crm_state ADD COLUMN IF NOT EXISTS agency_id UUID;
UPDATE crm_state SET agency_id = '00000000-0000-4000-8000-000000000001' WHERE id = 'primary' AND agency_id IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_state_agency_fk') THEN
    ALTER TABLE crm_state ADD CONSTRAINT crm_state_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies(id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS crm_state_agency_idx ON crm_state (agency_id) WHERE agency_id IS NOT NULL;

ALTER TABLE shared_quotes ADD COLUMN IF NOT EXISTS agency_id UUID;
UPDATE shared_quotes SET agency_id = '00000000-0000-4000-8000-000000000001' WHERE agency_id IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shared_quotes_agency_fk') THEN
    ALTER TABLE shared_quotes ADD CONSTRAINT shared_quotes_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS shared_quotes_agency_quote_idx ON shared_quotes (agency_id, quote_id);

COMMIT;
