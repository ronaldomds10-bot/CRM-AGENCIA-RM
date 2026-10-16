"use client";
import { calculateMileageFinance, purchaseThousandCents, type MileageFinance } from "@/lib/cpf-finance";

export type CpfFinanceDraft = {
  paid: string; received: string; miles: string; sellCents: string;
  paidFeeCents: string; chargedFeeCents: string; otherCents: string;
  chargedEdited: boolean; legacyBuyCents?: number;
};
export const emptyCpfFinance: CpfFinanceDraft = { paid: "", received: "", miles: "", sellCents: "", paidFeeCents: "", chargedFeeCents: "", otherCents: "", chargedEdited: false };
export function cpfFinanceDraft(input: MileageFinance | null): CpfFinanceDraft {
  if (!input) return { ...emptyCpfFinance };
  return {
    paid: input.purchase ? String(input.purchase.paidCents / 100) : "",
    received: input.purchase ? String(input.purchase.receivedMiles) : "",
    miles: String(input.miles), sellCents: String(input.sellCents / 100),
    paidFeeCents: String(input.paidFeeCents / 100), chargedFeeCents: String(input.chargedFeeCents / 100),
    otherCents: String(input.otherCents / 100), chargedEdited: true,
    ...(input.purchase ? {} : { legacyBuyCents: input.buyCents }),
  };
}
function decimal(value: string, integer = false) {
  if (!(integer ? /^\d+$/ : /^\d+(\.\d{1,2})?$/).test(value)) throw Error("Preencha os campos financeiros obrigatórios com valores válidos.");
  const [whole, fraction = ""] = value.split(".");
  return integer ? Number(whole) : Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function readCpfFinanceDraft(draft: CpfFinanceDraft, accountId: string): MileageFinance | null {
  const untouched = [draft.paid, draft.received, draft.miles, draft.sellCents, draft.paidFeeCents, draft.chargedFeeCents, draft.otherCents].every(v => v === "");
  if (untouched && draft.legacyBuyCents === undefined) return null;
  const purchase = draft.paid !== "" || draft.received !== "" || draft.legacyBuyCents === undefined
    ? { paidCents: decimal(draft.paid), receivedMiles: decimal(draft.received, true) } : undefined;
  const inputs: MileageFinance = {
    accountId, miles: decimal(draft.miles, true), buyCents: purchase ? purchaseThousandCents(purchase) : draft.legacyBuyCents!,
    sellCents: decimal(draft.sellCents), paidFeeCents: decimal(draft.paidFeeCents), chargedFeeCents: decimal(draft.chargedFeeCents),
    otherCents: decimal(draft.otherCents || "0"), ...(purchase ? { purchase } : {}),
  };
  calculateMileageFinance(inputs);
  return inputs;
}
export const cpfMoney = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function CpfFinanceSummary({ inputs, totals }: { inputs: MileageFinance; totals: ReturnType<typeof calculateMileageFinance> }) {
  return <div className="cpf-stats cpf-finance-summary" aria-live="polite">{[
    ["Milheiro de compra", cpfMoney(inputs.buyCents)], ["Custo das milhas", cpfMoney(totals.milesCost)], ["Venda das milhas", cpfMoney(totals.milesSale)],
    ["Taxa paga", cpfMoney(inputs.paidFeeCents)], ["Taxa cobrada", cpfMoney(inputs.chargedFeeCents)], ["Outros custos", cpfMoney(inputs.otherCents)],
    ["Custo total", cpfMoney(totals.cost)], ["Total cobrado", cpfMoney(totals.revenue)], ["Lucro", cpfMoney(totals.profit)],
  ].map(([label, value]) => <div key={label}><span>{label}</span><strong style={label === "Lucro" ? { color: totals.profit < 0 ? "#f87171" : "#4ade80" } : undefined}>{value}</strong></div>)}</div>;
}
const fields = [
  ["paid", "Valor total pago na compra das milhas (R$)", false], ["received", "Milhas recebidas na compra (incluindo bônus)", true],
  ["miles", "Milhas utilizadas na operação", true], ["sellCents", "Venda do milheiro (R$/1.000)", false],
  ["paidFeeCents", "Taxa aeroportuária paga (R$)", false], ["chargedFeeCents", "Taxa aeroportuária cobrada (R$)", false], ["otherCents", "Outros custos (R$, opcional)", false],
] as const;
export function CpfFinanceFields({ value, onChange, accountId, disabled = false }: { value: CpfFinanceDraft; onChange: (value: CpfFinanceDraft) => void; accountId: string; disabled?: boolean }) {
  let inputs: MileageFinance | null = null, problem = "";
  try { inputs = readCpfFinanceDraft(value, accountId); } catch (error) { problem = (error as Error).message; }
  let buy: number | undefined;
  try { buy = value.paid !== "" || value.received !== "" ? purchaseThousandCents({ paidCents: decimal(value.paid), receivedMiles: decimal(value.received, true) }) : value.legacyBuyCents; } catch { /* Pending purchase. */ }
  return <fieldset className="cpf-wide cpf-finance" disabled={disabled}>
    <legend><h2>Milhas e resultado financeiro</h2></legend>
    <p>Conta de origem: a conta selecionada nesta operação. Valores totais para todos os passageiros.</p>
    <div className="cpf-fields">{fields.map(([key, label, integer]) => <label key={key}>{label}<input className="input" type="number" min={key === "received" ? "1" : "0"} max={integer ? "1000000000" : "10000000"} step={integer ? "1" : "0.01"} value={value[key]} onChange={e => onChange({
      ...value, [key]: e.target.value,
      ...(key === "chargedFeeCents" ? { chargedEdited: true } : {}),
      ...(key === "paidFeeCents" && !value.chargedEdited ? { chargedFeeCents: e.target.value } : {}),
    })}/></label>)}<div><span>Milheiro de compra (calculado)</span><output className="input">{buy === undefined ? "Pendente" : cpfMoney(buy)}</output></div></div>
    {value.legacyBuyCents !== undefined && !value.paid && !value.received ? <p>Preço histórico preservado. Preencha os dados da compra para recalcular.</p> : null}
    <small>A taxa fica separada da compra. O custo considera somente as milhas utilizadas, com arredondamento final em centavos.</small>
    {inputs ? <><p>{inputs.miles.toLocaleString("pt-BR")} milhas utilizadas</p><CpfFinanceSummary inputs={inputs} totals={calculateMileageFinance(inputs)}/></> : <p role="status">Financeiro pendente{problem ? ` — ${problem}` : " — não preenchido"}</p>}
  </fieldset>;
}
