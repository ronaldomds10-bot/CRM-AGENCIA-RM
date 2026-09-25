import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listHolidayOpportunities, saveManualHoliday, syncHolidayData } from "@/lib/holiday-db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try { return NextResponse.json(await listHolidayOpportunities(user), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { console.error("Falha ao carregar feriados:", error); return NextResponse.json({ error: "Não foi possível carregar os feriados." }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "sync" || body.action === "recalculate") return NextResponse.json(await syncHolidayData(body.action === "sync"));
    if (body.action === "save") { await saveManualHoliday(body); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar feriados." }, { status: 400 });
  }
}
