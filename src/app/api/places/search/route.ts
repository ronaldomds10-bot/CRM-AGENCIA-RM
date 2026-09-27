import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { allowRequest } from "@/lib/rate-limit";
import { fetchGooglePlaces, PLACES_NOT_CONFIGURED } from "@/lib/google-places";
import { isTrustedMutation, readJsonBody, RequestInputError } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: NextRequest) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Requisição não permitida." }, { status: 403, headers });
  if (!await isAuthorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers });
  const identity = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  if (!allowRequest(identity.trim())) return NextResponse.json({ error: "Muitas pesquisas. Aguarde um instante." }, { status: 429, headers });

  let query = "";
  try { query = String((await readJsonBody<{ query?: string }>(request, 4 * 1024))?.query ?? "").trim(); }
  catch (error) { return NextResponse.json({ error: error instanceof RequestInputError ? error.message : "Dados inválidos." }, { status: error instanceof RequestInputError ? error.status : 400, headers }); }
  if (query.length < 3 || query.length > 120) return NextResponse.json({ error: "Informe ao menos 3 caracteres para pesquisar." }, { status: 400, headers });

  try {
    const response = await fetchGooglePlaces("/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.photos" },
      body: JSON.stringify({ textQuery: query, languageCode: "pt-BR", regionCode: "BR", includedType: "lodging", pageSize: 8 }),
    });
    if (!response) return NextResponse.json({ error: PLACES_NOT_CONFIGURED }, { status: 503, headers });
    if (!response.ok) return NextResponse.json({ error: "Não foi possível pesquisar hospedagens agora." }, { status: response.status === 429 ? 429 : 502, headers });
    const data = await response.json() as { places?: Array<{ id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; photos?: Array<{ name?: string }> }> };
    const places = (data.places ?? []).map((place) => ({
      id: place.id ?? "", name: place.displayName?.text ?? "Hospedagem", address: place.formattedAddress ?? "",
      location: place.location,
      photoNames: (place.photos ?? []).map((photo) => photo.name).filter((name): name is string => Boolean(name)).slice(0, 5),
    })).filter((place) => place.id && place.address);
    return NextResponse.json({ places }, { headers });
  } catch {
    return NextResponse.json({ error: "Não foi possível pesquisar hospedagens agora." }, { status: 504, headers });
  }
}
