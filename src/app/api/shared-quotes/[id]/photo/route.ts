import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getPool } from "@/lib/db";
import { fetchGooglePlaces, PLACES_NOT_CONFIGURED } from "@/lib/google-places";

export const runtime = "nodejs";
const photoPattern = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const name = request.nextUrl.searchParams.get("name") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !photoPattern.test(name)) {
    return NextResponse.json({ error: "Foto inválida." }, { status: 400 });
  }
  try {
    await ensureSchema();
    const result = await getPool().query("SELECT payload, quote_id FROM shared_quotes WHERE id = $1", [id]);
    const state = await getPool().query("SELECT payload FROM crm_state WHERE id = $1", ["primary"]);
    const currentQuotes = state.rows[0]?.payload?.quotes;
    const quote = Array.isArray(currentQuotes)
      ? currentQuotes.find((item: { id?: string }) => item.id === result.rows[0]?.quote_id) ?? result.rows[0]?.payload?.quote
      : result.rows[0]?.payload?.quote;
    if (!quote) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
    const hotels = [quote.hotel, ...(quote.hotelOptions ?? [])];
    const allowed = hotels.some((hotel) => Array.isArray(hotel?.photoNames) && hotel.photoNames.includes(name));
    if (!allowed) return NextResponse.json({ error: "Foto não pertence a este orçamento." }, { status: 404 });

    const response = await fetchGooglePlaces(`/v1/${name}/media?maxWidthPx=900&maxHeightPx=600&skipHttpRedirect=false`);
    if (!response) return NextResponse.json({ error: PLACES_NOT_CONFIGURED }, { status: 503 });
    if (!response.ok) return NextResponse.json({ error: "Foto indisponível." }, { status: 502 });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return NextResponse.json({ error: "Foto indisponível." }, { status: 502 });
    return new NextResponse(response.body, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800", "Content-Type": contentType, "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("Falha ao carregar foto compartilhada:", error);
    return NextResponse.json({ error: "Foto indisponível." }, { status: 504 });
  }
}
