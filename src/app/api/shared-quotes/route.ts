import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ensureSchema, getPool } from "@/lib/db";
import { canAccessRecord } from "@/lib/access";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const payload = await request.json();
    if (!payload?.quote) {
      return NextResponse.json({ error: "Orçamento inválido." }, { status: 400 });
    }

    const quoteId = String(payload.quote.id ?? "").trim();
    if (!quoteId) return NextResponse.json({ error: "Orçamento sem identificador." }, { status: 400 });
    await ensureSchema();
    const state = await getPool().query("SELECT payload FROM crm_state WHERE id = 'primary'");
    const data = state.rows[0]?.payload;
    const quote = Array.isArray(data?.quotes) ? data.quotes.find((item: { id?: string }) => item.id === quoteId) : null;
    if (!quote || !canAccessRecord(quote, user)) return NextResponse.json({ error: "Orçamento não autorizado." }, { status: 403 });
    const safePayload = { quote: { ...payload.quote, ownerId: quote.ownerId, assignedUserId: quote.assignedUserId }, settings: data.settings };
    const existing = await getPool().query(
      "SELECT id FROM shared_quotes WHERE quote_id = $1 ORDER BY created_at DESC LIMIT 1",
      [quoteId],
    );
    const id = existing.rows[0]?.id ?? randomUUID();
    if (existing.rows[0]) {
      await getPool().query("UPDATE shared_quotes SET payload = $2::jsonb WHERE id = $1", [id, JSON.stringify(safePayload)]);
    } else {
      await getPool().query("INSERT INTO shared_quotes (id, payload, quote_id) VALUES ($1, $2::jsonb, $3)", [id, JSON.stringify(safePayload), quoteId]);
    }
    return NextResponse.json({ id });
  } catch (error) {
    console.error("Falha ao compartilhar orçamento:", error);
    return NextResponse.json({ error: "Não foi possível gerar o link." }, { status: 503 });
  }
}
