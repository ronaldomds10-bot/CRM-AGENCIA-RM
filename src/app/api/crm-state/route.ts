import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { ensureSchema, getPool } from "@/lib/db";

export const runtime = "nodejs";
const STATE_ID = "primary";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    await ensureSchema();
    const result = await getPool().query("SELECT payload, updated_at FROM crm_state WHERE id = $1", [STATE_ID]);
    return NextResponse.json(result.rows[0] ? { data: result.rows[0].payload, updatedAt: result.rows[0].updated_at } : { data: null });
  } catch (error) {
    console.error("Falha ao carregar CRM:", error);
    return NextResponse.json({ error: "Banco de dados indisponível." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const data = await request.json();
    if (!data || typeof data !== "object" || !Array.isArray(data.quotes) || !Array.isArray(data.clients)) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }
    await ensureSchema();
    await getPool().query(
      `INSERT INTO crm_state (id, payload, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [STATE_ID, JSON.stringify(data)],
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Falha ao salvar CRM:", error);
    return NextResponse.json({ error: "Não foi possível salvar no banco." }, { status: 503 });
  }
}
