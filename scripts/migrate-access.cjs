const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

async function main() {
  const email = process.env.CRM_ADMIN_EMAIL?.trim().toLowerCase();
  if (!process.env.DATABASE_URL || !email) throw new Error('DATABASE_URL e CRM_ADMIN_EMAIL são obrigatórios.');
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString, ssl: connectionString.includes('.proxy.rlwy.net') ? { rejectUnauthorized: false } : undefined });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(__dirname, '../migrations/20260922_access_control.sql'), 'utf8'));
    await client.query(`INSERT INTO crm_users (id, email, name, role, active)
      VALUES ('admin', $1, 'Administrador', 'admin', TRUE)
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = 'admin', active = TRUE, updated_at = NOW()`, [email]);
    const state = await client.query("SELECT payload FROM crm_state WHERE id = 'primary' FOR UPDATE");
    const payload = state.rows[0]?.payload;
    const counts = {};
    if (payload) {
      for (const key of ['quotes', 'clients', 'suppliers', 'events']) {
        counts[key] = Array.isArray(payload[key]) ? payload[key].length : 0;
        if (Array.isArray(payload[key])) payload[key] = payload[key].map((record) => ({ ...record, ownerId: record.ownerId || 'admin' }));
      }
      await client.query("UPDATE crm_state SET payload = $1::jsonb, updated_at = NOW() WHERE id = 'primary'", [JSON.stringify(payload)]);
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ migration: '20260922_access_control', admin: true, records: counts, status: 'ok' }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
