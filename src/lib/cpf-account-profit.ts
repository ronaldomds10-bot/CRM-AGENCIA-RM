type Operation = { id: string; account_id: string; status: string; finance_totals: { profit: number } | null };

// Only operations already loaded by the agency-scoped CPF endpoint.
export function cpfAccountProfit(operations: Operation[], accountId: string) {
  let cents = BigInt(0), completed = 0, pending = 0;
  const seen = new Set<string>();
  for (const operation of operations) {
    if (operation.account_id !== accountId || operation.status !== "emitido" || seen.has(operation.id)) continue;
    seen.add(operation.id);
    const profit = operation.finance_totals?.profit;
    if (typeof profit !== "number" || !Number.isSafeInteger(profit)) { pending++; continue; }
    cents += BigInt(profit); completed++;
  }
  const absolute = cents < BigInt(0) ? -cents : cents;
  const formatted = completed ? `${cents < BigInt(0) ? "-" : ""}R$ ${(absolute / BigInt(100)).toLocaleString("pt-BR")},${String(absolute % BigInt(100)).padStart(2, "0")}` : null;
  return { formatted, completed, pending, sign: cents < BigInt(0) ? -1 : cents > BigInt(0) ? 1 : 0 };
}
