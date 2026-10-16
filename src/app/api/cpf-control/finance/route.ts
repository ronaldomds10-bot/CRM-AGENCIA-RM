import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { isTrustedMutation, readJsonBody, RequestInputError } from "@/lib/security";
import { saveCpfFinance } from "@/lib/cpf-finance-store";
import type { MileageFinance } from "@/lib/cpf-finance";

const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!validId(id)) return NextResponse.json({ error: "Registro inválido." }, { status: 400 });
  try {
    const operation = await getPool().query("SELECT e.account_id,a.alias,f.inputs,f.totals,COALESCE(f.revision,0) AS revision FROM mileage_emissions e JOIN mileage_accounts a ON a.id=e.account_id AND a.agency_id=e.agency_id LEFT JOIN cpf_operation_finance f ON f.emission_id=e.id AND f.agency_id=e.agency_id WHERE e.id=$1 AND e.agency_id=$2", [id,user.dataAgencyId]);
    if (!operation.rowCount) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
    const history = await getPool().query("SELECT h.revision,h.inputs,h.totals,h.created_at,u.name AS actor FROM cpf_operation_finance_history h JOIN crm_users u ON u.id=h.actor_id WHERE h.emission_id=$1 AND h.agency_id=$2 ORDER BY h.revision DESC", [id,user.dataAgencyId]);
    return NextResponse.json({ ...operation.rows[0], history: history.rows }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Não foi possível carregar o financeiro." }, { status: 503 }); }
}

export async function PUT(request: NextRequest) {
  if (!isTrustedMutation(request)) return NextResponse.json({ error: "Requisição não permitida." }, { status: 403 });
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  // Same permission as registering CPF operations: authenticated agency members.
  try {
    const body = await readJsonBody<{ id: string; revision: number; inputs: MileageFinance }>(request, 8192);
    if (!validId(body.id || "")) throw new RequestInputError("Registro inválido.");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const saved = await saveCpfFinance(client, user.dataAgencyId, user.id, body.id, body.revision, body.inputs);
      await client.query("COMMIT");
      return NextResponse.json(saved);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch (error) {
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Não foi possível salvar o financeiro." }, { status: 500 });
  }
}
