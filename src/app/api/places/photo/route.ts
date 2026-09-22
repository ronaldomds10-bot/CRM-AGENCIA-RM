import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { fetchGooglePlaces, PLACES_NOT_CONFIGURED } from "@/lib/google-places";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };
const photoPattern = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: noStore });
  const name = request.nextUrl.searchParams.get("name") ?? "";
  if (!photoPattern.test(name)) return NextResponse.json({ error: "Foto inválida." }, { status: 400, headers: noStore });
  try {
    const response = await fetchGooglePlaces(`/v1/${name}/media?maxWidthPx=240&maxHeightPx=160&skipHttpRedirect=false`);
    if (!response) return NextResponse.json({ error: PLACES_NOT_CONFIGURED }, { status: 503, headers: noStore });
    if (!response.ok) return NextResponse.json({ error: "Foto indisponível." }, { status: 502, headers: noStore });
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return NextResponse.json({ error: "Foto indisponível." }, { status: 502, headers: noStore });
    return new NextResponse(response.body, { headers: { ...noStore, "Content-Type": contentType, "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Foto indisponível." }, { status: 504, headers: noStore });
  }
}
