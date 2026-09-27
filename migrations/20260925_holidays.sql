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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM holidays WHERE type <> UPPER(TRIM(type)) OR UPPER(TRIM(type)) IN ('MUNICIPIO','CITY','LOCAL','ESTADUAL','NACIONAL','FACULTATIVO')) THEN
    DROP INDEX IF EXISTS holidays_natural_key_idx;
    UPDATE holidays SET type = CASE UPPER(TRIM(type))
      WHEN 'MUNICIPAL' THEN 'MUNICIPAL' WHEN 'MUNICIPIO' THEN 'MUNICIPAL' WHEN 'CITY' THEN 'MUNICIPAL' WHEN 'LOCAL' THEN 'MUNICIPAL'
      WHEN 'ESTADUAL' THEN 'STATE' WHEN 'STATE' THEN 'STATE'
      WHEN 'NACIONAL' THEN 'NATIONAL' WHEN 'NATIONAL' THEN 'NATIONAL'
      WHEN 'FACULTATIVO' THEN 'OPTIONAL' WHEN 'OPTIONAL' THEN 'OPTIONAL'
      ELSE UPPER(TRIM(type)) END;
    DELETE FROM holidays a USING holidays b
      WHERE a.id > b.id AND a.date=b.date AND LOWER(a.name)=LOWER(b.name) AND a.type=b.type
        AND COALESCE(a.state,'')=COALESCE(b.state,'') AND COALESCE(a.ibge_code,'')=COALESCE(b.ibge_code,'');
    CREATE UNIQUE INDEX holidays_natural_key_idx ON holidays (date, lower(name), type, COALESCE(state, ''), COALESCE(ibge_code, ''));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='holidays_type_canonical_check') THEN
    ALTER TABLE holidays ADD CONSTRAINT holidays_type_canonical_check CHECK (type IN ('NATIONAL','STATE','MUNICIPAL','OPTIONAL'));
  END IF;
END $$;
