// Exclusive to Controle de CPFs. Never read CRM quotes or general finance.
export type MileageFinance = {
  accountId: string;
  miles: number;
  buyCents: number;
  sellCents: number;
  paidFeeCents: number;
  chargedFeeCents: number;
  otherCents: number;
  purchase?: { paidCents: number; receivedMiles: number };
};

function roundRatio(numerator: bigint, denominator: bigint) {
  return Number((numerator * BigInt(2) + denominator) / (denominator * BigInt(2)));
}

export function purchaseThousandCents(purchase: NonNullable<MileageFinance["purchase"]>) {
  if (!purchase || !Number.isSafeInteger(purchase.paidCents) || purchase.paidCents < 0 || purchase.paidCents > 1_000_000_000 || !Number.isSafeInteger(purchase.receivedMiles) || purchase.receivedMiles <= 0 || purchase.receivedMiles > 1_000_000_000) throw new Error("Informe o valor da compra e uma quantidade de milhas recebidas maior que zero.");
  const price = roundRatio(BigInt(purchase.paidCents) * BigInt(1000), BigInt(purchase.receivedMiles));
  if (price > 1_000_000_000) throw new Error("Milheiro de compra acima do limite permitido.");
  return price;
}

export function calculateMileageFinance(input: MileageFinance) {
  if (input?.purchase !== undefined) input = { ...input, buyCents: purchaseThousandCents(input.purchase) };
  if (!input || typeof input.accountId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.accountId)) throw new Error("Selecione a conta de origem.");
  const keys = ["miles", "buyCents", "sellCents", "paidFeeCents", "chargedFeeCents", "otherCents"] as const;
  for (const key of keys) if (!Number.isSafeInteger(input[key]) || input[key] < 0 || input[key] > 1_000_000_000) throw new Error("Informe milhas inteiras e valores válidos, não negativos.");
  const rounded = (price: number) => Number((BigInt(input.miles) * BigInt(price) + BigInt(500)) / BigInt(1000));
  // Keep the purchase ratio exact until the final cent; displaying a rounded
  // thousand price must not inflate the cost of a partially used purchase.
  const milesCost = input.purchase ? roundRatio(BigInt(input.miles) * BigInt(input.purchase.paidCents), BigInt(input.purchase.receivedMiles)) : rounded(input.buyCents);
  const milesSale = rounded(input.sellCents);
  const revenue = milesSale + input.chargedFeeCents;
  const cost = milesCost + input.paidFeeCents + input.otherCents;
  const profit = revenue - cost;
  return { milesCost, milesSale, revenue, cost, profit, margin: revenue ? profit / revenue * 100 : null };
}

export function normalizeMileageFinance(input: MileageFinance): MileageFinance {
  calculateMileageFinance(input);
  const normalized = Object.fromEntries(["accountId", "miles", "buyCents", "sellCents", "paidFeeCents", "chargedFeeCents", "otherCents"].map(key => [key, input[key as keyof MileageFinance]])) as MileageFinance;
  if (input.purchase !== undefined) {
    normalized.purchase = { paidCents: input.purchase.paidCents, receivedMiles: input.purchase.receivedMiles };
    normalized.buyCents = purchaseThousandCents(normalized.purchase);
  }
  return normalized;
}
