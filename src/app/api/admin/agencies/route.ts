import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { ensureTenantSchema, getPool } from "@/lib/db";
import { isSuperAdmin, stateIdForAgency } from "@/lib/tenant";
import { isTrustedMutation, readJsonBody, RequestInputError } from "@/lib/security";

export const runtime = "nodejs";

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export async function GET(request: NextRequest) {
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isSuperAdmin(actor)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const result = await getPool().query(`SELECT a.id,a.name,a.slug,a.active,a.created_at,
    COUNT(u.id)::int AS user_count FROM agencies a LEFT JOIN crm_users u ON u.agency_id=a.id
    GROUP BY a.id ORDER BY a.created_at,a.name`);
  return NextResponse.json({ agencies: result.rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Requisição não permitida." }, { status: 403 });
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isSuperAdmin(actor)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  let body: { name?: string; slug?: string; adminName?: string; adminEmail?: string; adminPassword?: string };
  try { body = await readJsonBody(request, 12 * 1024); }
  catch (error) { return NextResponse.json({ error: error instanceof RequestInputError ? error.message : "Dados inválidos." }, { status: error instanceof RequestInputError ? error.status : 400 }); }
  const name = String(body.name || "").trim();
  const slug = slugify(String(body.slug || name));
  const adminName = String(body.adminName || "").trim();
  const adminEmail = String(body.adminEmail || "").trim().toLowerCase();
  const adminPassword = String(body.adminPassword || "");
  if (!name || name.length > 120 || !slug || !adminName || adminName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminPassword.length < 12 || adminPassword.length > 1024) {
    return NextResponse.json({ error: "Informe agência e administrador com senha de pelo menos 12 caracteres." }, { status: 400 });
  }
  await ensureTenantSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const agencyId = randomUUID();
    const agency = await client.query("INSERT INTO agencies (id,name,slug) VALUES ($1,$2,$3) RETURNING id,name,slug,active,created_at", [agencyId, name, slug]);
    await client.query("INSERT INTO crm_state (id,payload,agency_id) VALUES ($1,$2::jsonb,$3)", [stateIdForAgency(agencyId), JSON.stringify({ quotes: [], clients: [], suppliers: [], events: [], settings: {} }), agencyId]);
    await client.query(`INSERT INTO crm_users (id,email,name,role,tenant_role,agency_id,password_hash)
      VALUES ($1,$2,$3,'admin','agency_admin',$4,$5)`, [randomUUID(), adminEmail, adminName, agencyId, hashPassword(adminPassword)]);
    await client.query("COMMIT");
    return NextResponse.json({ agency: agency.rows[0] }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "Slug ou e-mail já cadastrado." }, { status: 409 });
    console.error("Falha ao criar agência:", error);
    return NextResponse.json({ error: "Não foi possível criar a agência." }, { status: 503 });
  } finally { client.release(); }
}
