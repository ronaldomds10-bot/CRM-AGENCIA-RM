-- Non-destructive; same schema is lazily ensured by /api/cpf-control.
CREATE TABLE IF NOT EXISTS mileage_accounts (
  id UUID PRIMARY KEY, agency_id UUID NOT NULL REFERENCES agencies(id), alias TEXT NOT NULL,
  holder_name TEXT NOT NULL, holder_cpf CHAR(11) NOT NULL,
  program TEXT NOT NULL CHECK(program IN ('LATAM Pass','Smiles','Azul Fidelidade')),
  member_number TEXT, azul_category TEXT, archived BOOLEAN NOT NULL DEFAULT FALSE,
  history_incomplete BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agency_id,program,holder_cpf)
);
CREATE TABLE IF NOT EXISTS mileage_emissions (
  id UUID PRIMARY KEY, agency_id UUID NOT NULL REFERENCES agencies(id), account_id UUID NOT NULL REFERENCES mileage_accounts(id),
  issued_on DATE NOT NULL, locator TEXT, operating_airline TEXT, flight_on DATE, status TEXT NOT NULL DEFAULT 'emitido',
  notes TEXT, justification TEXT, created_by TEXT NOT NULL REFERENCES crm_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS mileage_emission_passengers (
  id UUID PRIMARY KEY, emission_id UUID NOT NULL REFERENCES mileage_emissions(id), name TEXT NOT NULL,
  cpf CHAR(11) NOT NULL, released_at DATE, release_reason TEXT, UNIQUE(emission_id,cpf)
);
CREATE INDEX IF NOT EXISTS mileage_passenger_cpf_idx ON mileage_emission_passengers(cpf);
CREATE TABLE IF NOT EXISTS azul_beneficiaries (
  id UUID PRIMARY KEY, agency_id UUID NOT NULL REFERENCES agencies(id), account_id UUID NOT NULL REFERENCES mileage_accounts(id),
  name TEXT NOT NULL, cpf CHAR(11) NOT NULL, effective_on DATE NOT NULL, status TEXT NOT NULL DEFAULT 'ativo',
  removed_on DATE, inclusion_type TEXT NOT NULL DEFAULT 'inicial', release_on DATE, release_reason TEXT,
  is_child BOOLEAN NOT NULL DEFAULT FALSE, relationship_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  exemption_confirmed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(account_id,cpf)
);
CREATE TABLE IF NOT EXISTS mileage_rules (
  id UUID PRIMARY KEY, agency_id UUID NOT NULL REFERENCES agencies(id), program TEXT NOT NULL,
  account_id UUID REFERENCES mileage_accounts(id), limit_count INTEGER NOT NULL, waiting_days INTEGER NOT NULL DEFAULT 30,
  source TEXT NOT NULL, valid_from DATE NOT NULL, checked_on DATE NOT NULL, confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE, changed_by TEXT NOT NULL REFERENCES crm_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS mileage_audit (
  id UUID PRIMARY KEY, agency_id UUID NOT NULL REFERENCES agencies(id), actor_id TEXT NOT NULL,
  record_type TEXT NOT NULL, record_id UUID, action TEXT NOT NULL, reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mileage_rules_active_idx ON mileage_rules(agency_id,program,active,valid_from DESC);
