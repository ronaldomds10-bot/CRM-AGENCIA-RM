import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { ensureSchema, getPool } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const payload = await request.json();
    if (!payload?.quote || !payload?.settings) {
      return NextResponse.json({ error: "Orçamento inválido." }, { status: 400 });
    }

    const quoteId = String(payload.quote.id ?? "").trim();
    if (!quoteId) return NextResponse.json({ error: "Orçamento sem identificador." }, { status: 400 });
    await ensureSchema();
    const existing = await getPool().query(
      "SELECT id FROM shared_quotes WHERE quote_id = $1 ORDER BY created_at DESC LIMIT 1",
      [quoteId],
    );
    const id = existing.rows[0]?.id ?? randomUUID();
    if (existing.rows[0]) {
      await getPool().query("UPDATE shared_quotes SET payload = $2::jsonb WHERE id = $1", [id, JSON.stringify(payload)]);
    } else {
      await getPool().query("INSERT INTO shared_quotes (id, payload, quote_id) VALUES ($1, $2::jsonb, $3)", [id, JSON.stringify(payload), quoteId]);
    }
    return NextResponse.json({ id });
  } catch (error) {
    console.error("Falha ao compartilhar orçamento:", error);
    return NextResponse.json({ error: "Não foi possível gerar o link." }, { status: 503 });
  }
}
