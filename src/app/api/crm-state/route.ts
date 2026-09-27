import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ensureSchema, getPool } from "@/lib/db";
import { mergeState, settingsForUser, visibleState, type StatePayload } from "@/lib/access";
import { assignClientIbgeCodes } from "@/lib/holiday-db";
import { isTrustedMutation, readJsonBody, RequestInputError } from "@/lib/security";
import { isAgencyManager, stateIdForAgency } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    await ensureSchema();
    const result = await getPool().query("SELECT payload, updated_at FROM crm_state WHERE agency_id = $1", [user.dataAgencyId]);
    return NextResponse.json(result.rows[0]
      ? { data: visibleState(result.rows[0].payload as StatePayload, user), user, updatedAt: result.rows[0].updated_at }
      : { data: isAgencyManager(user) ? null : { quotes: [], clients: [], suppliers: [], events: [], settings: settingsForUser({ quotes: [], clients: [], suppliers: [], events: [], settings: {} }, user) }, user },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha ao carregar CRM:", error);
    return NextResponse.json({ error: "Banco de dados indisponível." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Requisição não permitida." }, { status: 403 });
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const data = await readJsonBody<StatePayload>(request, 8 * 1024 * 1024);
    if (!data || typeof data !== "object" || !Array.isArray(data.quotes) || !Array.isArray(data.clients)) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }
    await ensureSchema();
    const client = await getPool().connect();
    const stateId = stateIdForAgency(user.dataAgencyId);
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO crm_state (id, payload, agency_id) VALUES ($1, '{}'::jsonb, $2) ON CONFLICT (id) DO NOTHING", [stateId, user.dataAgencyId]);
      const current = await client.query("SELECT payload, updated_at FROM crm_state WHERE agency_id = $1 FOR UPDATE", [user.dataAgencyId]);
      const expectedVersion = request.headers.get("if-match");
      if (isAgencyManager(user) && expectedVersion && current.rows[0].updated_at.toISOString() !== expectedVersion) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Dados alterados por outro usuário. Recarregue a página." }, { status: 409 });
      }
      const existing = current.rows[0].payload as StatePayload;
      const merged = await assignClientIbgeCodes(mergeState(existing, data as StatePayload, user));
      const saved = await client.query("UPDATE crm_state SET payload = $2::jsonb, updated_at = NOW() WHERE agency_id = $1 RETURNING updated_at", [user.dataAgencyId, JSON.stringify(merged)]);
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, updatedAt: saved.rows[0].updated_at });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof Error && /inválid|autorizad|proprietário|atribuído/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 403 });
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Falha ao salvar CRM:", error);
    return NextResponse.json({ error: "Não foi possível salvar no banco." }, { status: 503 });
  }
}
