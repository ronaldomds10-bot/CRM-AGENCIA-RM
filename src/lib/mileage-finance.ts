export type MileageFinance = {
  accountId: string;
  miles: number;
  buyCents: number;
  sellCents: number;
  paidFeeCents: number;
  chargedFeeCents: number;
  otherCents: number;
};

export function calculateMileageFinance(input: MileageFinance) {
  if (!input || typeof input.accountId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.accountId)) throw new Error("Selecione a conta de origem.");
  const keys = ["miles", "buyCents", "sellCents", "paidFeeCents", "chargedFeeCents", "otherCents"] as const;
  for (const key of keys) if (!Number.isSafeInteger(input[key]) || input[key] < 0 || input[key] > 1_000_000_000) throw new Error("Informe milhas inteiras e valores válidos, não negativos.");
  const rounded = (price: number) => Number((BigInt(input.miles) * BigInt(price) + BigInt(500)) / BigInt(1000));
  const milesCost = rounded(input.buyCents), milesSale = rounded(input.sellCents);
  const revenue = milesSale + input.chargedFeeCents;
  const cost = milesCost + input.paidFeeCents + input.otherCents;
  const profit = revenue - cost;
  return { milesCost, milesSale, revenue, cost, profit, margin: revenue ? profit / revenue * 100 : null };
}

export function normalizeMileageFinance(input: MileageFinance): MileageFinance {
  calculateMileageFinance(input);
  return Object.fromEntries(["accountId", "miles", "buyCents", "sellCents", "paidFeeCents", "chargedFeeCents", "otherCents"].map(key => [key, input[key as keyof MileageFinance]])) as MileageFinance;
}
