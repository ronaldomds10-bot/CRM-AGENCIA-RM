import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { isSuperAdmin } from "@/lib/tenant";
import { isTrustedMutation, readJsonBody, RequestInputError } from "@/lib/security";

export const runtime = "nodejs";

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Requisição não permitida." }, { status: 403 });
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isSuperAdmin(actor)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  let body: { name?: string; slug?: string; active?: boolean };
  try { body = await readJsonBody(request, 8 * 1024); }
  catch (error) { return NextResponse.json({ error: error instanceof RequestInputError ? error.message : "Dados inválidos." }, { status: error instanceof RequestInputError ? error.status : 400 }); }
  const { id } = await context.params;
  const current = await getPool().query("SELECT name,slug,active FROM agencies WHERE id=$1", [id]);
  if (!current.rowCount) return NextResponse.json({ error: "Agência não encontrada." }, { status: 404 });
  const name = body.name === undefined ? current.rows[0].name : String(body.name).trim();
  const slug = body.slug === undefined ? current.rows[0].slug : slugify(String(body.slug));
  const active = body.active === undefined ? current.rows[0].active : body.active;
  if (!name || name.length > 120 || !slug || typeof active !== "boolean") return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    const result = await getPool().query("UPDATE agencies SET name=$2,slug=$3,active=$4,updated_at=NOW() WHERE id=$1 RETURNING id,name,slug,active,created_at", [id, name, slug, active]);
    if (!active) await getPool().query("DELETE FROM crm_sessions WHERE user_id IN (SELECT id FROM crm_users WHERE agency_id=$1)", [id]);
    return NextResponse.json({ agency: result.rows[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "Slug já cadastrado." }, { status: 409 });
    return NextResponse.json({ error: "Não foi possível editar a agência." }, { status: 503 });
  }
}
