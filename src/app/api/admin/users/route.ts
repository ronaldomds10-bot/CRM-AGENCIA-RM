import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { ensureTenantSchema, getPool } from "@/lib/db";
import { isAgencyManager, isSuperAdmin, type UserRole } from "@/lib/tenant";
import { isTrustedMutation, readJsonBody, RequestInputError } from "@/lib/security";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
const tenantRoles: UserRole[] = ["agency_admin", "agency_user"];

export async function GET(request: NextRequest) {
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isAgencyManager(actor)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const params: unknown[] = [];
  let where = "";
  if (!isSuperAdmin(actor)) { params.push(actor.agencyId); where = "WHERE u.agency_id = $1"; }
  else if (request.nextUrl.searchParams.get("agencyId")) { params.push(request.nextUrl.searchParams.get("agencyId")); where = "WHERE u.agency_id = $1"; }
  const result = await getPool().query(
    `SELECT u.id,u.email,u.name,u.tenant_role AS role,u.active,u.created_at,u.agency_id,a.name AS agency_name
     FROM crm_users u LEFT JOIN agencies a ON a.id=u.agency_id ${where} ORDER BY a.name,u.created_at,u.email`, params,
  );
  return NextResponse.json({ users: result.rows }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Requisição não permitida." }, { status: 403 });
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isAgencyManager(actor)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  let body: { email?: string; name?: string; password?: string; role?: UserRole; agencyId?: string };
  try { body = await readJsonBody(request, 8 * 1024); }
  catch (error) { return NextResponse.json({ error: error instanceof RequestInputError ? error.message : "Dados inválidos." }, { status: error instanceof RequestInputError ? error.status : 400 }); }
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  const role = body.role || "agency_user";
  const agencyId = isSuperAdmin(actor) ? String(body.agencyId || "") : actor.agencyId || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120 || password.length < 12 || password.length > 1024 || !tenantRoles.includes(role) || !agencyId) {
    return NextResponse.json({ error: "Informe agência, nome, e-mail e senha de pelo menos 12 caracteres." }, { status: 400 });
  }
  try {
    await ensureTenantSchema();
    const agency = await getPool().query("SELECT id FROM agencies WHERE id=$1 AND active=TRUE", [agencyId]);
    if (!agency.rowCount) return NextResponse.json({ error: "Agência inválida ou inativa." }, { status: 400 });
    const result = await getPool().query(
      `INSERT INTO crm_users (id,email,name,role,tenant_role,agency_id,password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,email,name,tenant_role AS role,active,created_at,agency_id`,
      [randomUUID(), email, name, role === "agency_admin" ? "admin" : "user", role, agencyId, hashPassword(password)],
    );
    return NextResponse.json({ user: result.rows[0] }, { status: 201, headers: noStore });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "E-mail já cadastrado." }, { status: 409 });
    return NextResponse.json({ error: "Não foi possível criar usuário." }, { status: 503 });
  }
}
