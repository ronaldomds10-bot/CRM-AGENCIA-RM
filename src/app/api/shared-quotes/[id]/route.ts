import { NextResponse } from "next/server";
import { ensureSchema, getPool } from "@/lib/db";
import { isShareId, publicQuoteDto, publicSettingsDto } from "@/lib/shared-quote";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!isShareId(id)) {
      return NextResponse.json({ error: "Link inválido." }, { status: 400 });
    }

    await ensureSchema();
    const result = await getPool().query("SELECT payload,quote_id,agency_id FROM shared_quotes WHERE id=$1", [id]);
    if (!result.rows[0]) {
      return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
    }
    const state = await getPool().query("SELECT payload FROM crm_state WHERE agency_id=$1", [result.rows[0].agency_id]);
    const currentData = state.rows[0]?.payload;
    const currentQuote = Array.isArray(currentData?.quotes)
      ? currentData.quotes.find((quote: { id?: string }) => quote.id === result.rows[0].quote_id)
      : null;
    const shared = result.rows[0].payload;
    const currentSettings = shared.sharedByRole === "user" || shared.sharedByRole === "agency_user"
      ? currentData?.userSettings?.[shared.sharedByUserId] ?? shared.settings
      : currentData?.settings ?? shared.settings;
    const payload = currentQuote
      ? { quote: publicQuoteDto(currentQuote), settings: publicSettingsDto(currentSettings) }
      : result.rows[0].payload;
    return NextResponse.json({ quote: publicQuoteDto(payload.quote), settings: publicSettingsDto(payload.settings) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Falha ao abrir orçamento compartilhado:", error);
    return NextResponse.json({ error: "Não foi possível abrir o orçamento." }, { status: 503 });
  }
}
