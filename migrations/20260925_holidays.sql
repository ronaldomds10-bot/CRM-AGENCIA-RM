CREATE TABLE IF NOT EXISTS municipalities (
  ibge_code TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  state CHAR(2) NOT NULL,
  normalized_city TEXT NOT NULL,
  UNIQUE (normalized_city, state)
);

CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  year INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('NATIONAL','STATE','MUNICIPAL','OPTIONAL')),
  state CHAR(2),
  ibge_code TEXT,
  city TEXT,
  source TEXT NOT NULL CHECK (source IN ('OPEN_SOURCE','CALCULATED','MANUAL')),
  source_year INTEGER NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('CONFIRMED','PROJECTED','MANUAL')),
  projection_method TEXT CHECK (projection_method IS NULL OR projection_method IN ('FIXED_ANNUAL_RECURRENCE','EASTER_RELATIVE','LEGAL_FIXED_DATE')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS holidays_natural_key_idx ON holidays
  (date, lower(name), type, COALESCE(state, ''), COALESCE(ibge_code, ''));
CREATE INDEX IF NOT EXISTS holidays_date_idx ON holidays (date) WHERE is_active;
CREATE INDEX IF NOT EXISTS holidays_location_idx ON holidays (year, state, ibge_code) WHERE is_active;
