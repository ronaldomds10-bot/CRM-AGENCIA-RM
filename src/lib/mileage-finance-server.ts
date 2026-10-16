import type { PoolClient } from "pg";
import type { StatePayload } from "./access";
import { normalizeMileageFinance, calculateMileageFinance, type MileageFinance } from "./mileage-finance";
import { RequestInputError } from "./security";

export async function validateEmissionFinances(client: PoolClient, existing: StatePayload, merged: StatePayload, agency: string, actor: string) {
  const previous = new Map((existing.quotes || []).map(q => [q.id, q]));
  for (const q of merged.quotes) {
    const old = previous.get(q.id);
    const details = q.issue as Record<string, unknown> | undefined;
    const oldDetails = old?.issue as Record<string, unknown> | undefined;
    const oldFinance = oldDetails?.finance;
    // Old clients may not erase an established financial snapshot.
    if (oldFinance && !details?.finance) throw new RequestInputError("Recarregue a emissão antes de alterar o financeiro.", 409);
    if (details?.finance) {
      let finance: MileageFinance;
      try { finance = normalizeMileageFinance(details.finance as MileageFinance); }
      catch (error) { throw new RequestInputError((error as Error).message); }
      const account = await client.query("SELECT id FROM mileage_accounts WHERE id=$1 AND agency_id=$2", [finance.accountId, agency]);
      if (!account.rowCount) throw new RequestInputError("Conta de origem não encontrada nesta agência.");
      details.finance = finance;
      if (q.isIssue && details.method === "miles") {
        const totals = calculateMileageFinance(finance);
        q.cashPrice = totals.revenue / 100;
        q.cost = totals.cost / 100;
        Object.assign(details, { pointsAmount: finance.miles, thousandCost: finance.buyCents / 100, fees: finance.paidFeeCents / 100 });
      }
    }
    const before = oldFinance ? { finance: oldFinance, status: old?.status, method: oldDetails?.method } : null;
    const after = details?.finance ? { finance: details.finance, status: q.status, method: details.method } : null;
    if (JSON.stringify(before) !== JSON.stringify(after)) await client.query("INSERT INTO emission_finance_audit(agency_id,emission_id,actor_id,before_value,after_value) VALUES($1,$2,$3,$4,$5)", [agency,q.id,actor,JSON.stringify(before),JSON.stringify(after)]);
    previous.delete(q.id);
  }
  for (const q of previous.values()) {
    const details = q.issue as Record<string, unknown> | undefined;
    if (details?.finance) await client.query("INSERT INTO emission_finance_audit(agency_id,emission_id,actor_id,before_value,after_value) VALUES($1,$2,$3,$4,NULL)", [agency,q.id,actor,JSON.stringify({ finance: details.finance, status: q.status, method: details.method })]);
  }
}
