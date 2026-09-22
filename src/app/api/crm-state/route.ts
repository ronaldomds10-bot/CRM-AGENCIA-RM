import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ensureSchema, getPool } from "@/lib/db";
import { mergeState, visibleState, type StatePayload } from "@/lib/access";

export const runtime = "nodejs";
const STATE_ID = "primary";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    await ensureSchema();
    const result = await getPool().query("SELECT payload, updated_at FROM crm_state WHERE id = $1", [STATE_ID]);
    return NextResponse.json(result.rows[0]
      ? { data: visibleState(result.rows[0].payload as StatePayload, user), user, updatedAt: result.rows[0].updated_at }
      : { data: user.role === "admin" ? null : { quotes: [], clients: [], suppliers: [], events: [], settings: {} }, user },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha ao carregar CRM:", error);
    return NextResponse.json({ error: "Banco de dados indisponível." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const data = await request.json();
    if (!data || typeof data !== "object" || !Array.isArray(data.quotes) || !Array.isArray(data.clients)) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }
    await ensureSchema();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO crm_state (id, payload) VALUES ($1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING", [STATE_ID]);
      const current = await client.query("SELECT payload, updated_at FROM crm_state WHERE id = $1 FOR UPDATE", [STATE_ID]);
      const expectedVersion = request.headers.get("if-match");
      if (user.role === "admin" && expectedVersion && current.rows[0].updated_at.toISOString() !== expectedVersion) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Dados alterados por outro usuário. Recarregue a página." }, { status: 409 });
      }
      const existing = current.rows[0].payload as StatePayload;
      const merged = mergeState(existing, data as StatePayload, user);
      const saved = await client.query("UPDATE crm_state SET payload = $2::jsonb, updated_at = NOW() WHERE id = $1 RETURNING updated_at", [STATE_ID, JSON.stringify(merged)]);
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
    console.error("Falha ao salvar CRM:", error);
    return NextResponse.json({ error: "Não foi possível salvar no banco." }, { status: 503 });
  }
}
