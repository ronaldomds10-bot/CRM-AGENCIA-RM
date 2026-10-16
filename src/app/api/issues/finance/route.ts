import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { canAccessRecord, type StatePayload } from "@/lib/access";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  const state = await getPool().query("SELECT payload FROM crm_state WHERE agency_id=$1", [user.dataAgencyId]);
  const record = (state.rows[0]?.payload as StatePayload | undefined)?.quotes?.find(q => q.id === id);
  if (record && !canAccessRecord(record, user)) return NextResponse.json({ error: "Emissão não encontrada." }, { status: 404 });
  const [accounts, history] = await Promise.all([
    getPool().query("SELECT id,alias,program,acquisition_thousand_cents FROM mileage_accounts WHERE agency_id=$1 AND NOT archived ORDER BY alias", [user.dataAgencyId]),
    record ? getPool().query("SELECT a.id,a.before_value,a.after_value,a.created_at,u.name AS actor FROM emission_finance_audit a JOIN crm_users u ON u.id=a.actor_id WHERE a.agency_id=$1 AND a.emission_id=$2 ORDER BY a.id DESC", [user.dataAgencyId,id]) : Promise.resolve({ rows: [] }),
  ]);
  return NextResponse.json({ accounts: accounts.rows, history: history.rows }, { headers: { "Cache-Control": "no-store" } });
}
