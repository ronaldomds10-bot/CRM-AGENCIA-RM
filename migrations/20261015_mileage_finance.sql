-- Additive: existing JSON emissions remain pending until explicitly completed.
-- Rollback: revert application deployment; retain this audit table and snapshots.
CREATE TABLE IF NOT EXISTS emission_finance_audit (
  id BIGSERIAL PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  emission_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES crm_users(id),
  before_value JSONB,
  after_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emission_finance_audit_lookup ON emission_finance_audit(agency_id, emission_id, created_at);
ALTER TABLE mileage_accounts ADD COLUMN IF NOT EXISTS acquisition_thousand_cents BIGINT CHECK (acquisition_thousand_cents >= 0);
