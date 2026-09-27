CREATE TABLE IF NOT EXISTS crm_login_attempts (
  key_hash TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS crm_login_attempts_reset_idx ON crm_login_attempts (reset_at);
