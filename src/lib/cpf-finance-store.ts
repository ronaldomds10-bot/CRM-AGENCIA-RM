import type { PoolClient } from "pg";
import { calculateMileageFinance, normalizeMileageFinance, type MileageFinance } from "./cpf-finance";
import { RequestInputError } from "./security";

// Caller owns transaction. Lock the existing CPF operation, not passengers or CRM.
export async function saveCpfFinance(client: PoolClient, agency: string, actor: string, id: string, revision: number, submitted: MileageFinance) {
  const operation = await client.query("SELECT account_id FROM mileage_emissions WHERE id=$1 AND agency_id=$2 FOR UPDATE", [id, agency]);
  if (!operation.rowCount) throw new RequestInputError("Registro não encontrado.", 404);
  let inputs: MileageFinance;
  try { inputs = normalizeMileageFinance({ ...submitted, accountId: operation.rows[0].account_id }); }
  catch (error) { throw new RequestInputError((error as Error).message); }
  const current = await client.query("SELECT inputs,revision FROM cpf_operation_finance WHERE emission_id=$1 AND agency_id=$2", [id, agency]);
  if (!Number.isInteger(revision) || revision !== (current.rows[0]?.revision ?? 0)) throw new RequestInputError("Financeiro alterado por outra pessoa. Reabra o registro.", 409);
  const totals = calculateMileageFinance(inputs);
  if (current.rowCount && JSON.stringify(normalizeMileageFinance(current.rows[0].inputs)) === JSON.stringify(inputs)) return { inputs, totals, revision };
  const next = revision + 1;
  await client.query(`INSERT INTO cpf_operation_finance(emission_id,agency_id,account_id,inputs,totals,revision)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(emission_id) DO UPDATE SET inputs=EXCLUDED.inputs,totals=EXCLUDED.totals,revision=EXCLUDED.revision,updated_at=NOW()`, [id, agency, inputs.accountId, JSON.stringify(inputs), JSON.stringify(totals), next]);
  await client.query("INSERT INTO cpf_operation_finance_history(emission_id,agency_id,account_id,actor_id,revision,inputs,totals) VALUES($1,$2,$3,$4,$5,$6,$7)", [id, agency, inputs.accountId, actor, next, JSON.stringify(inputs), JSON.stringify(totals)]);
  return { inputs, totals, revision: next };
}
