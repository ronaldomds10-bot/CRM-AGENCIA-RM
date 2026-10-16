// Run with node --env-file=<target env file> scripts/migrate-mileage-finance.cjs
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('.proxy.rlwy.net') ? { rejectUnauthorized: false } : undefined });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(826674622)');
    await client.query('LOCK TABLE crm_state IN SHARE MODE');
    const fingerprint = () => client.query("SELECT id, md5(payload::text) AS hash FROM crm_state ORDER BY id");
    const before = await fingerprint();
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20261015_mileage_finance.sql'), 'utf8');
    await client.query(sql);
    await client.query(sql); // Prove migration retry is safe.
    const after = await fingerprint();
    if (JSON.stringify(before.rows) !== JSON.stringify(after.rows)) throw new Error('Existing CRM data changed');
    await client.query('COMMIT');
    console.log('Migration applied; retry verified; all existing CRM payloads preserved.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
