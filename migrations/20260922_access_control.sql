-- Expansiva e idempotente. Para reverter o aplicativo, mantenha estas tabelas e os ownerId existentes;
-- a versão anterior ignora as colunas e chaves extras sem perda de dados.
CREATE TABLE IF NOT EXISTS crm_state (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_users_email_idx ON crm_users (LOWER(email));

CREATE TABLE IF NOT EXISTS crm_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crm_sessions_user_idx ON crm_sessions (user_id);
CREATE INDEX IF NOT EXISTS crm_sessions_expiry_idx ON crm_sessions (expires_at);
