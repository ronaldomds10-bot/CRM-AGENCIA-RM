import "server-only";
import { createHash } from "node:crypto";
import { getPool } from "@/lib/db";
import { canAccessRecord, type StatePayload } from "@/lib/access";
import type { AuthUser } from "@/lib/auth";
import municipalities from "@/data/municipalities.json";
import holidays2026 from "@/data/holidays-2026.json";
import { commercialPriority, normalizeLocation, opportunityFor, projectHolidays2027, type HolidaySeed, type HolidayType } from "@/lib/holidays";

const STATE_ID = "primary";
const source2026: HolidaySeed[] = holidays2026.map((item) => ({
  ...item,
  type: item.type as HolidayType,
  source: "OPEN_SOURCE",
  sourceYear: 2026,
  verificationStatus: "CONFIRMED",
  projectionMethod: null,
}));

export async function ensureHolidaySchema() {
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
  const uniqueRows = [...new Map(rows.map((row) => [holidayId(row), row])).values()];
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

export async function backfillClientIbgeCodes() {
  const result = await getPool().query("SELECT payload FROM crm_state WHERE id=$1", [STATE_ID]);
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
  if (changed) await getPool().query("UPDATE crm_state SET payload=$2::jsonb, updated_at=NOW() WHERE id=$1", [STATE_ID, JSON.stringify(payload)]);
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

export async function syncHolidayData(checkSource = false) {
  await ensureHolidaySchema();
  await insertMunicipalities();
  await insertHolidays(source2026);
  await insertHolidays(projectHolidays2027(source2026));
  const clients = await backfillClientIbgeCodes();
  return { ...(await holidayStats()), clients, message: checkSource ? await checkRemote2027() : "Base local atualizada." };
}

export async function ensureHolidayData() {
  await ensureHolidaySchema();
  const result = await getPool().query("SELECT COUNT(*)::int AS count FROM holidays");
  if (!result.rows[0].count) await syncHolidayData(false);
}

export async function holidayStats() {
  await ensureHolidaySchema();
  const counts = await getPool().query(`SELECT year, verification_status, COUNT(*)::int AS count FROM holidays WHERE is_active GROUP BY year, verification_status`);
  const locations = await getPool().query("SELECT COUNT(*)::int AS count FROM municipalities");
  const clientResult = await getPool().query("SELECT payload FROM crm_state WHERE id=$1", [STATE_ID]);
  const clients = (clientResult.rows[0]?.payload?.clients || []) as Array<Record<string, unknown>>;
  return {
    counts: counts.rows,
    municipalities: locations.rows[0].count,
    clientsWithIbge: clients.filter((client) => client.ibgeCode).length,
    distinctClientCities: new Set(clients.filter((client) => client.ibgeCode).map((client) => client.ibgeCode)).size,
  };
}

type DbHoliday = { id: string; name: string; date: string; type: HolidayType; state: string | null; ibge_code: string | null; city: string | null; verification_status: string; projection_method: string | null };

export async function listHolidayOpportunities(user: AuthUser) {
  await ensureHolidayData();
  const stateResult = await getPool().query("SELECT payload FROM crm_state WHERE id=$1", [STATE_ID]);
  const payload = (stateResult.rows[0]?.payload || { clients: [] }) as StatePayload;
  const clients = (payload.clients || []).filter((client) => canAccessRecord(client, user));
  const byIbge = new Map<string, number>(); const byState = new Map<string, number>();
  for (const client of clients) {
    const ibge = String(client.ibgeCode || ""); const state = String(client.state || client.uf || "").toUpperCase();
    if (ibge) byIbge.set(ibge, (byIbge.get(ibge) || 0) + 1);
    if (state) byState.set(state, (byState.get(state) || 0) + 1);
  }
  const today = new Date().toISOString().slice(0, 10);
  const rows = await getPool().query(`SELECT id,name,to_char(date,'YYYY-MM-DD') AS date,type,state,ibge_code,city,verification_status,projection_method FROM holidays WHERE is_active AND date >= $1 AND date <= '2027-12-31' ORDER BY date,name`, [today]);
  const opportunities = (rows.rows as DbHoliday[]).flatMap((holiday) => {
    const opportunity = opportunityFor(holiday.date); if (!opportunity) return [];
    const clientCount = holiday.type === "MUNICIPAL" || (holiday.type === "OPTIONAL" && holiday.ibge_code)
      ? byIbge.get(holiday.ibge_code || "") || 0
      : holiday.type === "STATE" || (holiday.type === "OPTIONAL" && holiday.state)
        ? byState.get(holiday.state || "") || 0
        : clients.length;
    if ((holiday.type === "MUNICIPAL" || holiday.type === "STATE" || (holiday.type === "OPTIONAL" && (holiday.state || holiday.ibge_code))) && !clientCount) return [];
    const daysUntil = Math.max(0, Math.ceil((new Date(`${holiday.date}T12:00:00Z`).getTime() - Date.now()) / 86400000));
    return [{ ...holiday, ibgeCode: holiday.ibge_code, verificationStatus: holiday.verification_status, projectionMethod: holiday.projection_method, ...opportunity, clientCount, daysUntil, priority: commercialPriority(daysUntil) }];
  });
  return { opportunities, impactedClients: new Set(clients.filter((client) => client.ibgeCode || client.state).map((client) => client.id)).size, stats: await holidayStats() };
}

export async function clientsForHoliday(user: AuthUser, type: HolidayType, state?: string, ibgeCode?: string) {
  const result = await getPool().query("SELECT payload FROM crm_state WHERE id=$1", [STATE_ID]);
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
  if (id) {
    await getPool().query(`UPDATE holidays SET name=COALESCE($2,name), date=COALESCE($3::date,date), year=EXTRACT(YEAR FROM COALESCE($3::date,date)), verification_status=COALESCE($4,verification_status), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$1`, [id, input.name || null, input.date || null, input.verificationStatus || null, typeof input.isActive === "boolean" ? input.isActive : null]);
    return;
  }
  const type = String(input.type || "NATIONAL") as HolidayType;
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
