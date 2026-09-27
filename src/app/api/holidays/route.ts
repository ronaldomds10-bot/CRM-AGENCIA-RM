import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listHolidayOpportunities, saveManualHoliday, syncHolidayData } from "@/lib/holiday-db";
import { isTrustedMutation, readJsonBody, RequestInputError } from "@/lib/security";
import { isAgencyManager } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const params = request.nextUrl.searchParams;
    return NextResponse.json(await listHolidayOpportunities(user, {
      type: params.get("type") || undefined,
      state: params.get("state") || undefined,
      city: params.get("city") || undefined,
      ibgeCode: params.get("ibgeCode") || undefined,
      year: params.get("year") || undefined,
      verification: params.get("verification") || undefined,
    }), { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { console.error("Falha ao carregar feriados:", error); return NextResponse.json({ error: "Não foi possível carregar os feriados." }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Requisição não permitida." }, { status: 403 });
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isAgencyManager(user)) return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 32 * 1024);
    if (body.action === "sync" || body.action === "recalculate") return NextResponse.json(await syncHolidayData(body.action === "sync", user));
    if (body.action === "save") { await saveManualHoliday(body); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = error instanceof Error && /^(Tipo de feriado inválido|Dados do feriado inválidos)/.test(error.message)
      ? error.message
      : "Falha ao atualizar feriados.";
    if (message === "Falha ao atualizar feriados.") console.error(message, error);
    return NextResponse.json({ error: message }, { status: message === "Falha ao atualizar feriados." ? 500 : 400 });
  }
}
