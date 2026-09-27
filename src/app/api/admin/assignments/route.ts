import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { RECORD_KEYS, type RecordKey, type StatePayload } from "@/lib/access";
import { isTrustedMutation, readJsonBody, RequestInputError } from "@/lib/security";
import { isAgencyManager } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isAgencyManager(actor)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  const state = await getPool().query("SELECT payload FROM crm_state WHERE agency_id=$1", [actor.dataAgencyId]);
  const payload = state.rows[0]?.payload as StatePayload | undefined;
  const records = RECORD_KEYS.flatMap((key) => (payload?.[key] || []).map((record) => ({
    key, id: record.id, label: String(record.name || record.title || record.client || record.id), ownerId: record.ownerId || "admin", assignedUserId: record.assignedUserId || "",
  })));
  return NextResponse.json({ records }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Requisição não permitida." }, { status: 403 });
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isAgencyManager(actor)) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  let body: { key?: string; id?: string; assignedUserId?: string };
  try { body = await readJsonBody(request, 8 * 1024); }
  catch (error) { return NextResponse.json({ error: error instanceof RequestInputError ? error.message : "Dados inválidos." }, { status: error instanceof RequestInputError ? error.status : 400 }); }
  if (!RECORD_KEYS.includes(body.key as RecordKey) || !body.id || typeof body.assignedUserId !== "string") return NextResponse.json({ error: "Atribuição inválida." }, { status: 400 });
  if (body.assignedUserId) {
    const target = await getPool().query("SELECT id FROM crm_users WHERE id=$1 AND active=TRUE AND tenant_role='agency_user' AND agency_id=$2", [body.assignedUserId, actor.dataAgencyId]);
    if (!target.rowCount) return NextResponse.json({ error: "Usuário indisponível." }, { status: 400 });
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const state = await client.query("SELECT payload FROM crm_state WHERE agency_id=$1 FOR UPDATE", [actor.dataAgencyId]);
    const payload = state.rows[0]?.payload as StatePayload | undefined;
    const records = payload?.[body.key as RecordKey];
    const record = records?.find((item) => item.id === body.id);
    if (!record) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 }); }
    record.assignedUserId = body.assignedUserId || null;
    await client.query("UPDATE crm_state SET payload=$1::jsonb,updated_at=NOW() WHERE agency_id=$2", [JSON.stringify(payload), actor.dataAgencyId]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: "Não foi possível atribuir registro." }, { status: 503 });
  } finally {
    client.release();
  }
}
