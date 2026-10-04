import "server-only";
import { createHash } from "node:crypto";
import { getPool } from "@/lib/db";
import { canAccessRecord, type StatePayload } from "@/lib/access";
import type { AuthUser } from "@/lib/auth";
import municipalities from "@/data/municipalities.json";
import holidays2026 from "@/data/holidays-2026.json";
import { commercialPriority, normalizeHolidayType, normalizeLocation, opportunityFor, projectHolidays2027, type HolidaySeed, type HolidayType } from "@/lib/holidays";

const source2026: HolidaySeed[] = holidays2026.map((item) => ({
  ...item,
  type: item.type as HolidayType,
  source: "OPEN_SOURCE",
  sourceYear: 2026,
  verificationStatus: "CONFIRMED",
  projectionMethod: null,
}));

let holidaySchemaReady: Promise<void> | null = null;

export function ensureHolidaySchema() {
  if (!holidaySchemaReady) {
    holidaySchemaReady = createHolidaySchema().catch((error) => {
      holidaySchemaReady = null;
      throw error;
    });
  }
  return holidaySchemaReady;
}

async function createHolidaySchema() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS municipalities (ibge_code TEXT PRIMARY KEY, city TEXT NOT NULL, state CHAR(2) NOT NULL, normalized_city TEXT NOT NULL, UNIQUE (normalized_city, state));
    CREATE TABLE IF NOT EXISTS holidays (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, date DATE NOT NULL, year INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('NATIONAL','STATE','MUNICIPAL','OPTIONAL')),
      state CHAR(2), ibge_code TEXT, city TEXT,
      source TEXT NOT NULL CHECK (source IN ('OPEN_SOURCE','CALCULATED','MANUAL')),
      source_year INTEGER NOT NULL,
      verification_status TEXT NOT NULL CHECK (verification_status IN ('CONFIRMED','PROJECTED','MANUAL')),
      projection_method TEXT CHECK (projection_method IS NULL OR projection_method IN ('FIXED_ANNUAL_RECURRENCE','EASTER_RELATIVE','LEGAL_FIXED_DATE')),
      is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS holidays_natural_key_idx ON holidays (date, lower(name), type, COALESCE(state, ''), COALESCE(ibge_code, ''));
    CREATE INDEX IF NOT EXISTS holidays_date_idx ON holidays (date) WHERE is_active;
    CREATE INDEX IF NOT EXISTS holidays_location_idx ON holidays (year, state, ibge_code) WHERE is_active;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM holidays WHERE type <> UPPER(TRIM(type)) OR UPPER(TRIM(type)) IN ('MUNICIPIO','CITY','LOCAL','ESTADUAL','NACIONAL','FACULTATIVO')) THEN
        DROP INDEX IF EXISTS holidays_natural_key_idx;
        UPDATE holidays SET type=CASE UPPER(TRIM(type)) WHEN 'MUNICIPAL' THEN 'MUNICIPAL' WHEN 'MUNICIPIO' THEN 'MUNICIPAL' WHEN 'CITY' THEN 'MUNICIPAL' WHEN 'LOCAL' THEN 'MUNICIPAL' WHEN 'ESTADUAL' THEN 'STATE' WHEN 'STATE' THEN 'STATE' WHEN 'NACIONAL' THEN 'NATIONAL' WHEN 'NATIONAL' THEN 'NATIONAL' WHEN 'FACULTATIVO' THEN 'OPTIONAL' WHEN 'OPTIONAL' THEN 'OPTIONAL' ELSE UPPER(TRIM(type)) END;
        DELETE FROM holidays a USING holidays b WHERE a.id>b.id AND a.date=b.date AND LOWER(a.name)=LOWER(b.name) AND a.type=b.type AND COALESCE(a.state,'')=COALESCE(b.state,'') AND COALESCE(a.ibge_code,'')=COALESCE(b.ibge_code,'');
        CREATE UNIQUE INDEX holidays_natural_key_idx ON holidays (date, lower(name), type, COALESCE(state, ''), COALESCE(ibge_code, ''));
      END IF;
    END $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='holidays_type_canonical_check') THEN ALTER TABLE holidays ADD CONSTRAINT holidays_type_canonical_check CHECK (type IN ('NATIONAL','STATE','MUNICIPAL','OPTIONAL')); END IF; END $$;
    DELETE FROM holidays WHERE date < '2026-10-01' OR date > '2027-12-31';
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='holidays_supported_dates_check') THEN ALTER TABLE holidays ADD CONSTRAINT holidays_supported_dates_check CHECK (date BETWEEN '2026-10-01' AND '2027-12-31'); END IF; END $$;
  `);
}

function holidayId(row: HolidaySeed) {
  return createHash("sha256").update([row.date, row.name.toLowerCase(), row.type, row.state || "", row.ibgeCode || ""].join("|")).digest("hex").slice(0, 32);
}

async function insertMunicipalities() {
  for (let offset = 0; offset < municipalities.length; offset += 1000) {
    const chunk = municipalities.slice(offset, offset + 1000).map((row) => ({ ...row, normalizedCity: normalizeLocation(row.city) }));
    await getPool().query(`INSERT INTO municipalities (ibge_code, city, state, normalized_city)
      SELECT x.ibge_code, x.city, x.state, x.normalized_city FROM jsonb_to_recordset($1::jsonb) AS x(ibge_code text, city text, state text, normalized_city text)
      ON CONFLICT (ibge_code) DO UPDATE SET city=EXCLUDED.city, state=EXCLUDED.state, normalized_city=EXCLUDED.normalized_city`, [JSON.stringify(chunk.map((row) => ({ ibge_code: row.ibgeCode, city: row.city, state: row.state, normalized_city: row.normalizedCity })))]);
  }
}

async function insertHolidays(rows: HolidaySeed[]) {
  let imported = 0;
  // Keep the full 2026 source for 2027 projections, but only import supported dates.
  const uniqueRows = [...new Map(rows.filter((row) => row.date >= "2026-10-01" && row.date <= "2027-12-31").map((row) => [holidayId(row), row])).values()];
  for (let offset = 0; offset < uniqueRows.length; offset += 500) {
    const chunk = uniqueRows.slice(offset, offset + 500).map((row) => ({
      id: holidayId(row), name: row.name, date: row.date, year: Number(row.date.slice(0, 4)), type: row.type,
      state: row.state, ibge_code: row.ibgeCode, city: row.city, source: row.source, source_year: row.sourceYear,
      verification_status: row.verificationStatus, projection_method: row.projectionMethod,
    }));
    const result = await getPool().query(`INSERT INTO holidays (id,name,date,year,type,state,ibge_code,city,source,source_year,verification_status,projection_method)
      SELECT x.id,x.name,x.date::date,x.year,x.type,x.state,x.ibge_code,x.city,x.source,x.source_year,x.verification_status,x.projection_method
      FROM jsonb_to_recordset($1::jsonb) AS x(id text,name text,date text,year int,type text,state text,ibge_code text,city text,source text,source_year int,verification_status text,projection_method text)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,date=EXCLUDED.date,year=EXCLUDED.year,type=EXCLUDED.type,state=EXCLUDED.state,ibge_code=EXCLUDED.ibge_code,city=EXCLUDED.city,source=EXCLUDED.source,source_year=EXCLUDED.source_year,verification_status=EXCLUDED.verification_status,projection_method=EXCLUDED.projection_method,is_active=TRUE,updated_at=NOW()
      WHERE holidays.source <> 'MANUAL' AND holidays.verification_status <> 'MANUAL'`, [JSON.stringify(chunk)]);
    imported += result.rowCount || 0;
  }
  return imported;
}

function inferLocation(client: Record<string, unknown>) {
  let city = String(client.city || "").trim();
  let state = String(client.state || client.uf || "").trim().toUpperCase();
  if ((!city || !state) && typeof client.address === "string") {
    const match = client.address.match(/(?:-|,)\s*([^,/-]+)\s*\/\s*([A-Za-z]{2})(?:,|$)/);
    if (match) { city ||= match[1].trim(); state ||= match[2].toUpperCase(); }
  }
  return { city, state };
}

export async function assignClientIbgeCodes(payload: StatePayload) {
  await ensureHolidayData();
  const rows = await getPool().query("SELECT ibge_code, city, state, normalized_city FROM municipalities");
  const lookup = new Map(rows.rows.map((row) => [`${row.normalized_city}|${row.state}`, row]));
  for (const client of payload.clients || []) {
    const { city, state } = inferLocation(client);
    const match = city && /^[A-Z]{2}$/.test(state) ? lookup.get(`${normalizeLocation(city)}|${state}`) : undefined;
    if (match) { client.ibgeCode = match.ibge_code; client.city = match.city; client.state = match.state; }
    else if (city || state) delete client.ibgeCode;
  }
  return payload;
}

export async function backfillClientIbgeCodes(user: AuthUser) {
  const result = await getPool().query("SELECT payload FROM crm_state WHERE agency_id=$1", [user.dataAgencyId]);
  if (!result.rows[0]) return { associated: 0, cities: 0 };
  const payload = result.rows[0].payload as StatePayload;
  const clients = Array.isArray(payload.clients) ? payload.clients : [];
  const before = JSON.stringify(clients);
  let changed = false;
  for (const client of clients) {
    void client;
  }
  await assignClientIbgeCodes(payload);
  changed = before !== JSON.stringify(clients);
  if (changed) await getPool().query("UPDATE crm_state SET payload=$2::jsonb,updated_at=NOW() WHERE agency_id=$1", [user.dataAgencyId, JSON.stringify(payload)]);
  const associated = clients.filter((client) => client.ibgeCode).length;
  return { associated, cities: new Set(clients.filter((client) => client.ibgeCode).map((client) => client.ibgeCode)).size };
}

async function checkRemote2027() {
  const base = "https://raw.githubusercontent.com/joaopbini/feriados-brasil/master/dados/feriados";
  const paths = ["nacional", "estadual", "municipal", "facultativo"];
  const statuses = await Promise.all(paths.map(async (folder) => {
    try { return (await fetch(`${base}/${folder}/json/2027.json`, { method: "HEAD", cache: "no-store" })).status; } catch { return 0; }
  }));
  return statuses.every((status) => status === 404 || status === 0) ? "Fonte 2027 ainda não publicada." : "Fonte 2027 detectada; projeções preservadas até importação validada.";
}

export async function syncHolidayData(checkSource = false, user?: AuthUser) {
  await ensureHolidaySchema();
  await insertMunicipalities();
  await insertHolidays(source2026);
  await insertHolidays(projectHolidays2027(source2026));
  const clients = user ? await backfillClientIbgeCodes(user) : { associated: 0, cities: 0 };
  return { ...(await holidayStats(user)), clients, message: checkSource ? await checkRemote2027() : "Base local atualizada." };
}

export async function ensureHolidayData() {
  await ensureHolidaySchema();
  const result = await getPool().query("SELECT COUNT(*)::int AS count FROM holidays");
  if (!result.rows[0].count) await syncHolidayData(false);
}

export async function holidayStats(user?: AuthUser) {
  await ensureHolidaySchema();
  const [counts, locations, typeCounts, municipal, clientResult] = await Promise.all([
    getPool().query(`SELECT year, verification_status, COUNT(*)::int AS count FROM holidays WHERE is_active GROUP BY year, verification_status`),
    getPool().query("SELECT COUNT(*)::int AS count FROM municipalities"),
    getPool().query("SELECT type, COUNT(*)::int AS count FROM holidays WHERE is_active GROUP BY type ORDER BY type"),
    getPool().query("SELECT COUNT(DISTINCT ibge_code)::int AS cities, COUNT(*) FILTER (WHERE city IS NULL OR state IS NULL OR ibge_code IS NULL OR year IS NULL OR date IS NULL OR name IS NULL)::int AS incomplete FROM holidays WHERE is_active AND type='MUNICIPAL'"),
    user ? getPool().query("SELECT payload FROM crm_state WHERE agency_id=$1", [user.dataAgencyId]) : Promise.resolve({ rows: [] }),
  ]);
  const allClients = (clientResult.rows[0]?.payload?.clients || []) as Array<Record<string, unknown> & { id: string; ownerId?: string; assignedUserId?: string | null }>;
  const clients = user ? allClients.filter((client) => canAccessRecord(client, user)) : allClients;
  return {
    counts: counts.rows,
    typeCounts: typeCounts.rows,
    years: [...new Set(counts.rows.map((row) => Number(row.year)))].sort(),
    municipalCities: municipal.rows[0].cities,
    incompleteMunicipal: municipal.rows[0].incomplete,
    municipalities: locations.rows[0].count,
    clientsWithIbge: clients.filter((client) => client.ibgeCode).length,
    distinctClientCities: new Set(clients.filter((client) => client.ibgeCode).map((client) => client.ibgeCode)).size,
  };
}

type DbHoliday = { id: string; name: string; date: string; year: number; type: HolidayType; state: string | null; ibge_code: string | null; city: string | null; verification_status: string; projection_method: string | null };

export type HolidayFilters = { type?: string; state?: string; city?: string; ibgeCode?: string; year?: string; verification?: string };

export async function listHolidayOpportunities(user: AuthUser, filters: HolidayFilters = {}) {
  await ensureHolidayData();
  const stateResult = await getPool().query("SELECT payload FROM crm_state WHERE agency_id=$1", [user.dataAgencyId]);
  const payload = (stateResult.rows[0]?.payload || { clients: [] }) as StatePayload;
  const clients = (payload.clients || []).filter((client) => canAccessRecord(client, user));
  const byIbge = new Map<string, number>(); const byState = new Map<string, number>();
  for (const client of clients) {
    const ibge = String(client.ibgeCode || ""); const state = String(client.state || client.uf || "").toUpperCase();
    if (ibge) byIbge.set(ibge, (byIbge.get(ibge) || 0) + 1);
    if (state) byState.set(state, (byState.get(state) || 0) + 1);
  }
  let selectedLocation: { ibge_code: string; city: string; state: string } | undefined;
  if (filters.ibgeCode) {
    const locationValues = [filters.ibgeCode]; const locationClauses = ["ibge_code=$1"];
    if (filters.state) { locationValues.push(filters.state.toUpperCase()); locationClauses.push(`state=$${locationValues.length}`); }
    if (filters.city) { locationValues.push(normalizeLocation(filters.city)); locationClauses.push(`normalized_city=$${locationValues.length}`); }
    const found = await getPool().query(`SELECT ibge_code,city,state FROM municipalities WHERE ${locationClauses.join(" AND ")}`, locationValues);
    selectedLocation = found.rows[0];
  } else if (filters.city) {
    const values = filters.state
      ? [normalizeLocation(filters.city), filters.state.toUpperCase()]
      : [normalizeLocation(filters.city)];
    const found = await getPool().query(`SELECT ibge_code,city,state FROM municipalities WHERE normalized_city=$1${filters.state ? " AND state=$2" : ""}`, values);
    if (found.rowCount === 1) selectedLocation = found.rows[0];
  }
  const clauses = ["is_active", "date BETWEEN '2026-10-01' AND '2027-12-31'"]; const values: unknown[] = [];
  const add = (sql: string, value: unknown) => { values.push(value); clauses.push(sql.replace("?", `$${values.length}`)); };
  if (["NATIONAL", "STATE", "MUNICIPAL", "OPTIONAL"].includes(filters.type || "")) add("type=?", filters.type);
  if (["CONFIRMED", "PROJECTED", "MANUAL"].includes(filters.verification || "")) add("verification_status=?", filters.verification);
  if (["2026", "2027"].includes(filters.year || "")) add("year=?", Number(filters.year));
  if (selectedLocation) {
    values.push(selectedLocation.state, selectedLocation.ibge_code);
    clauses.push(`(type='NATIONAL' OR (type='STATE' AND state=$${values.length - 1}) OR (type='MUNICIPAL' AND state=$${values.length - 1} AND ibge_code=$${values.length}) OR (type='OPTIONAL' AND ((state IS NULL AND ibge_code IS NULL) OR state=$${values.length - 1} OR ibge_code=$${values.length})))`);
  } else if (filters.state) {
    values.push(filters.state.toUpperCase());
    clauses.push(`(type='NATIONAL' OR ((type='STATE' OR type='MUNICIPAL') AND state=$${values.length}) OR (type='OPTIONAL' AND (state IS NULL OR state=$${values.length})))`);
  }
  if ((filters.city || filters.ibgeCode) && !selectedLocation) clauses.push("FALSE");
  const selectFields = "id,name,to_char(date,'YYYY-MM-DD') AS date,year,type,state,ibge_code,city,verification_status,projection_method";
  const [rows, future] = await Promise.all([
    getPool().query(`SELECT ${selectFields} FROM holidays WHERE ${clauses.join(" AND ")} ORDER BY date,name LIMIT 751`, values),
    !Object.values(filters).some(Boolean)
      ? getPool().query(`SELECT ${selectFields} FROM holidays WHERE is_active AND date >= $1 AND date <= '2027-12-31'`, [new Date().toISOString().slice(0, 10)])
      : Promise.resolve(null),
  ]);
  const enrich = (holiday: DbHoliday) => {
    const opportunity = opportunityFor(holiday.date);
    const clientCount = holiday.type === "MUNICIPAL" || (holiday.type === "OPTIONAL" && holiday.ibge_code)
      ? byIbge.get(holiday.ibge_code || "") || 0
      : holiday.type === "STATE" || (holiday.type === "OPTIONAL" && holiday.state)
        ? byState.get(holiday.state || "") || 0
        : clients.length;
    const daysUntil = Math.ceil((new Date(`${holiday.date}T12:00:00Z`).getTime() - Date.now()) / 86400000);
    return { ...holiday, ibgeCode: holiday.ibge_code, verificationStatus: holiday.verification_status, projectionMethod: holiday.projection_method, opportunity, clientCount, daysUntil, priority: opportunity && daysUntil >= 0 ? commercialPriority(daysUntil) : "—" };
  };
  const normalizedHolidays = (rows.rows as DbHoliday[]).slice(0, 750).map(enrich);
  let opportunityCandidates = normalizedHolidays;
  if (future) opportunityCandidates = (future.rows as DbHoliday[]).map(enrich);
  const opportunities = opportunityCandidates.filter((holiday) => holiday.opportunity && (holiday.type === "NATIONAL" || (holiday.type === "OPTIONAL" && !holiday.state && !holiday.ibgeCode) || holiday.clientCount > 0)).map((holiday) => ({ ...holiday, ...holiday.opportunity }));
  return { holidays: normalizedHolidays, opportunities, truncated: (rows.rowCount || 0) > 750, selectedLocation, locationError: (filters.city || filters.ibgeCode) && !selectedLocation ? "Cidade ou código IBGE não encontrado. Informe cidade e UF corretas." : "", impactedClients: new Set(clients.filter((client) => client.ibgeCode || client.state).map((client) => client.id)).size, stats: await holidayStats(user) };
}

export async function clientsForHoliday(user: AuthUser, type: HolidayType, state?: string, ibgeCode?: string) {
  const result = await getPool().query("SELECT payload FROM crm_state WHERE agency_id=$1", [user.dataAgencyId]);
  const payload = (result.rows[0]?.payload || { clients: [] }) as StatePayload;
  const seen = new Set<string>();
  return (payload.clients || []).filter((client) => canAccessRecord(client, user)).filter((client) => {
    if (seen.has(client.id)) return false;
    const match = type === "MUNICIPAL" || (type === "OPTIONAL" && ibgeCode)
      ? client.ibgeCode === ibgeCode
      : type === "STATE" || (type === "OPTIONAL" && state)
        ? String(client.state || client.uf || "").toUpperCase() === state
        : true;
    if (match) seen.add(client.id); return match;
  }).map((client) => ({ id: client.id, name: client.name, phone: client.phone || "", city: client.city || "", state: client.state || client.uf || "" }));
}

export async function saveManualHoliday(input: Record<string, unknown>) {
  await ensureHolidayData();
  const id = String(input.id || "");
  if ((!id || input.date) && (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < "2026-10-01" || input.date > "2027-12-31")) {
    throw new Error("Dados do feriado inválidos. A data deve estar entre 01/10/2026 e 31/12/2027.");
  }
  if (id) {
    await getPool().query(`UPDATE holidays SET name=COALESCE($2,name), date=COALESCE($3::date,date), year=EXTRACT(YEAR FROM COALESCE($3::date,date)), verification_status=COALESCE($4,verification_status), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$1`, [id, input.name || null, input.date || null, input.verificationStatus || null, typeof input.isActive === "boolean" ? input.isActive : null]);
    return;
  }
  const type = normalizeHolidayType(String(input.type || "NATIONAL"));
  if (!type) throw new Error("Tipo de feriado inválido.");
  const state = String(input.state || "").toUpperCase() || null;
  let ibgeCode = String(input.ibgeCode || "") || null; let city = String(input.city || "") || null;
  if (type === "MUNICIPAL" && city && state && !ibgeCode) {
    const found = await getPool().query("SELECT ibge_code,city FROM municipalities WHERE normalized_city=$1 AND state=$2", [normalizeLocation(city), state]);
    ibgeCode = found.rows[0]?.ibge_code || null; city = found.rows[0]?.city || city;
  }
  const row: HolidaySeed = { name: String(input.name || "").trim(), date: String(input.date || ""), type, state, ibgeCode, city, source: "MANUAL", sourceYear: Number(String(input.date).slice(0, 4)), verificationStatus: "MANUAL", projectionMethod: null };
  if (!row.name || !/^202[67]-\d{2}-\d{2}$/.test(row.date) || (type === "MUNICIPAL" && !ibgeCode)) throw new Error("Dados do feriado inválidos.");
  await insertHolidays([row]);
}
