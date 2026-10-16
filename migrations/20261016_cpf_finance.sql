-- Additive: no backfill, no changes to CRM or CPF passenger/counting records.
-- Rollback: revert application code; retain tables for financial history.
CREATE TABLE IF NOT EXISTS cpf_operation_finance (
  emission_id UUID PRIMARY KEY REFERENCES mileage_emissions(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  account_id UUID NOT NULL REFERENCES mileage_accounts(id),
  inputs JSONB NOT NULL,
  totals JSONB NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cpf_operation_finance_agency ON cpf_operation_finance(agency_id);
CREATE TABLE IF NOT EXISTS cpf_operation_finance_history (
  id BIGSERIAL PRIMARY KEY,
  emission_id UUID NOT NULL,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  account_id UUID NOT NULL REFERENCES mileage_accounts(id),
  actor_id TEXT NOT NULL REFERENCES crm_users(id),
  revision INTEGER NOT NULL,
  inputs JSONB NOT NULL,
  totals JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agency_id, emission_id, revision)
);
