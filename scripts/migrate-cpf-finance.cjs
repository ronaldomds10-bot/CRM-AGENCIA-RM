const fs = require('node:fs'), path = require('node:path');
const { Pool } = require('pg');
async function main() {
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('.proxy.rlwy.net') ? { rejectUnauthorized: false } : undefined });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(826674623)');
    await client.query('LOCK TABLE crm_state,mileage_emissions,mileage_emission_passengers IN SHARE MODE');
    const fingerprint = async () => {
      const results = [];
      for (const table of ['crm_state','mileage_emissions','mileage_emission_passengers']) results.push((await client.query(`SELECT id,md5(row_to_json(t)::text) AS hash FROM ${table} t ORDER BY id`)).rows);
      return JSON.stringify(results);
    };
    const before = await fingerprint();
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20261016_cpf_finance.sql'), 'utf8');
    await client.query(sql); await client.query(sql);
    if (before !== await fingerprint()) throw Error('Existing records changed');
    await client.query('COMMIT');
    console.log('CPF finance migration applied and retry verified; CRM, operations and passengers preserved.');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
