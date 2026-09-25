import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { clientsForHoliday } from "@/lib/holiday-db";
import type { HolidayType } from "@/lib/holidays";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const type = request.nextUrl.searchParams.get("type") as HolidayType;
  if (!["NATIONAL", "STATE", "MUNICIPAL", "OPTIONAL"].includes(type)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  return NextResponse.json({ clients: await clientsForHoliday(user, type, request.nextUrl.searchParams.get("state") || undefined, request.nextUrl.searchParams.get("ibgeCode") || undefined) });
}
