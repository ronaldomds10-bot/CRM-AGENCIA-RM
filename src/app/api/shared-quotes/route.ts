import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ensureSchema, getPool } from "@/lib/db";
import { canAccessRecord, settingsForUser, type StatePayload } from "@/lib/access";
import { isTrustedMutation, readJsonBody, RequestInputError } from "@/lib/security";
import { publicQuoteDto, publicSettingsDto } from "@/lib/shared-quote";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Requisição não permitida." }, { status: 403 });
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const payload = await readJsonBody<{ quoteId?: string; quote?: { id?: string } }>(request, 16 * 1024);
    const quoteId = String(payload.quoteId ?? payload.quote?.id ?? "").trim();
    if (!quoteId || quoteId.length > 100) {
      return NextResponse.json({ error: "Orçamento inválido." }, { status: 400 });
    }

    await ensureSchema();
    const state = await getPool().query("SELECT payload FROM crm_state WHERE agency_id=$1", [user.dataAgencyId]);
    const data = state.rows[0]?.payload;
    const quote = Array.isArray(data?.quotes) ? data.quotes.find((item: { id?: string }) => item.id === quoteId) : null;
    if (!quote || !canAccessRecord(quote, user)) return NextResponse.json({ error: "Orçamento não autorizado." }, { status: 403 });
    const safePayload = { quote: publicQuoteDto(quote), settings: publicSettingsDto(settingsForUser(data as StatePayload, user)), sharedByUserId: user.id, sharedByRole: user.role };
    const existing = await getPool().query(
      "SELECT id FROM shared_quotes WHERE agency_id=$1 AND quote_id=$2 ORDER BY created_at DESC LIMIT 1",
      [user.dataAgencyId, quoteId],
    );
    const id = existing.rows[0]?.id ?? randomUUID();
    if (existing.rows[0]) {
      await getPool().query("UPDATE shared_quotes SET payload = $2::jsonb WHERE id = $1", [id, JSON.stringify(safePayload)]);
    } else {
      await getPool().query("INSERT INTO shared_quotes (id,payload,quote_id,agency_id) VALUES ($1,$2::jsonb,$3,$4)", [id, JSON.stringify(safePayload), quoteId, user.dataAgencyId]);
    }
    return NextResponse.json({ id });
  } catch (error) {
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Falha ao compartilhar orçamento:", error);
    return NextResponse.json({ error: "Não foi possível gerar o link." }, { status: 503 });
  }
}
