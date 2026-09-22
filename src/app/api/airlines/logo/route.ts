import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const PUBLIC_AIRLINE_CODES = new Set(["AD", "AA", "AM", "G3", "LA", "KL", "AR", "CA", "AT", "IB", "TP"]);

export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!PUBLIC_AIRLINE_CODES.has(code)) return NextResponse.json({ error: "Companhia não cadastrada." }, { status: 404 });
  try {
    const response = await fetch(`https://images.kiwi.com/airlines/128/${encodeURIComponent(code)}.png`, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 604800 },
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/")) return NextResponse.json({ error: "Logo indisponível." }, { status: 404 });
    return new NextResponse(response.body, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800", "Content-Type": contentType, "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Logo indisponível." }, { status: 504 });
  }
}
