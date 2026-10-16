"use client";
import { useEffect, useState } from "react";
import { calculateMileageFinance, purchaseThousandCents, type MileageFinance } from "@/lib/cpf-finance";

type Totals = ReturnType<typeof calculateMileageFinance>;
type History = { revision: number; inputs: MileageFinance; totals: Totals; created_at: string; actor: string };
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fields = [["miles", "Milhas utilizadas"], ["buyCents", "Compra do milheiro (R$/1.000)"], ["sellCents", "Venda do milheiro (R$/1.000)"], ["paidFeeCents", "Taxa aeroportuária paga (R$)"], ["chargedFeeCents", "Taxa aeroportuária cobrada (R$)"], ["otherCents", "Outros custos (R$, opcional)"]] as const;
type Draft = Record<typeof fields[number][0], string>;
const empty: Draft = { miles: "", buyCents: "", sellCents: "", paidFeeCents: "", chargedFeeCents: "", otherCents: "" };
function parsePurchase(paid: string, received: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(paid) || !/^\d+$/.test(received)) throw Error("Preencha o valor pago e as milhas recebidas, incluindo bônus.");
  const [whole, fraction = ""] = paid.split(".");
  const purchase = { paidCents: Number(whole) * 100 + Number(fraction.padEnd(2, "0")), receivedMiles: Number(received) };
  return { purchase, buyCents: purchaseThousandCents(purchase) };
}
function parse(draft: Draft, accountId: string): MileageFinance {
  const values: Record<string, number> = {};
  for (const [key] of fields) {
    const value = draft[key] || (key === "otherCents" ? "0" : "");
    if (!(key === "miles" ? /^\d+$/ : /^\d+(\.\d{1,2})?$/).test(value)) throw Error("Preencha os valores obrigatórios; use milhas inteiras e até duas casas decimais.");
    const [whole, fraction = ""] = value.split(".");
    values[key] = key === "miles" ? Number(whole) : Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  }
  const inputs = { accountId, ...values } as MileageFinance;
  calculateMileageFinance(inputs);
  return inputs;
}
export function CpfFinanceSummary({ inputs, totals }: { inputs: MileageFinance; totals: Totals }) {
  return <div className="cpf-stats cpf-finance-summary" aria-live="polite">{[
    ["Custo das milhas", money(totals.milesCost)], ["Venda das milhas", money(totals.milesSale)],
    ["Taxa paga", money(inputs.paidFeeCents)], ["Taxa cobrada", money(inputs.chargedFeeCents)],
    ["Outros custos", money(inputs.otherCents)], ["Custo total", money(totals.cost)],
    ["Total cobrado", money(totals.revenue)], ["Lucro", money(totals.profit)],
  ].map(([label, value]) => <div key={label}><span>{label}</span><strong style={label === "Lucro" ? { color: totals.profit < 0 ? "#f87171" : "#4ade80" } : undefined}>{value}</strong></div>)}</div>;
}
export default function CpfFinance({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>(empty);
  const [byPurchase, setByPurchase] = useState(false);
  const [purchasePaid, setPurchasePaid] = useState(""), [purchaseMiles, setPurchaseMiles] = useState("");
  const [account, setAccount] = useState({ id: "", alias: "" });
  const [revision, setRevision] = useState(0), [history, setHistory] = useState<History[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [chargedEdited, setChargedEdited] = useState(false), [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`/api/cpf-control/finance?id=${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      setAccount({ id: data.account_id, alias: data.alias }); setRevision(data.revision); setHistory(data.history);
      setDraft(data.inputs ? Object.fromEntries(fields.map(([key]) => [key, String(data.inputs[key] / (key === "miles" ? 1 : 100))])) as Draft : empty);
      setChargedEdited(Boolean(data.inputs));
      setByPurchase(data.inputs?.purchase !== undefined);
      setPurchasePaid(data.inputs?.purchase ? String(data.inputs.purchase.paidCents / 100) : "");
      setPurchaseMiles(data.inputs?.purchase ? String(data.inputs.purchase.receivedMiles) : "");
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, reload]);
  let inputs: MileageFinance | null = null, totals: Totals | null = null;
  let purchaseResult: ReturnType<typeof parsePurchase> | null = null, purchaseError = "";
  if (byPurchase) try { purchaseResult = parsePurchase(purchasePaid, purchaseMiles); } catch (e) { purchaseError = (e as Error).message; }
  try {
    if (byPurchase && !purchaseResult) throw Error(purchaseError);
    const parsed = parse(purchaseResult ? { ...draft, buyCents: String(purchaseResult.buyCents / 100) } : draft, account.id);
    if (purchaseResult) parsed.purchase = purchaseResult.purchase;
    totals = calculateMileageFinance(parsed); inputs = parsed;
  } catch { /* Not filled yet. */ }
  return <section className="cpf-form cpf-finance">
    <h2>Financeiro da operação · {account.alias}</h2>
    <p>Totais por operação, incluindo todos os passageiros. Exclusivo do Controle de CPFs.</p>
    {loading ? <p role="status">Carregando financeiro…</p> : null}
    {error ? <p role="alert" className="cpf-alert error">{error} <button type="button" onClick={() => setReload(n => n + 1)}>Recarregar</button></p> : null}
    {notice ? <p role="status" className="cpf-alert">{notice}</p> : null}
    {!loading && account.id ? <form onSubmit={async event => {
      event.preventDefault(); setError(""); setNotice("");
      if (!inputs) { setError("Preencha todos os valores obrigatórios."); return; }
      setBusy(true);
      try {
        const response = await fetch("/api/cpf-control/finance", { method: "PUT", headers: { "Content-Type": "application/json", "X-RM-CSRF": "1" }, body: JSON.stringify({ id, revision, inputs }) });
        const saved = await response.json(); if (!response.ok) throw Error(saved.error);
        setRevision(saved.revision); setNotice("Financeiro salvo."); setReload(n => n + 1); await onSaved();
      } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy}><div className="cpf-fields">{fields.map(([key, label]) => <div key={key}><label>{label}<input className="input" type="number" required={key !== "otherCents"} min="0" max={key === "miles" ? "1000000000" : "10000000"} step={key === "miles" ? "1" : "0.01"} readOnly={key === "buyCents" && byPurchase} value={key === "buyCents" && byPurchase ? (purchaseResult ? String(purchaseResult.buyCents / 100) : "") : draft[key]} onChange={e => {
        const value = e.target.value; setNotice("");
        if (key === "chargedFeeCents") setChargedEdited(true);
        setDraft(previous => ({ ...previous, [key]: value, ...(key === "paidFeeCents" && !chargedEdited ? { chargedFeeCents: value } : {}) }));
      }}/></label>{key === "buyCents" ? <><label className="cpf-check"><input type="checkbox" checked={byPurchase} onChange={e => {
        if (!e.target.checked && purchaseResult) setDraft(previous => ({ ...previous, buyCents: String(purchaseResult.buyCents / 100) }));
        setByPurchase(e.target.checked); setNotice("");
      }}/>Calcular pela compra</label>{byPurchase ? <div className="cpf-purchase-fields">
        <label>Valor total pago pelas milhas (R$)<input className="input" type="number" min="0" max="10000000" step="0.01" required value={purchasePaid} onChange={e => { setPurchasePaid(e.target.value); setNotice(""); }}/></label>
        <label>Milhas recebidas na compra (incluindo bônus)<input className="input" type="number" min="1" max="1000000000" step="1" required value={purchaseMiles} onChange={e => { setPurchaseMiles(e.target.value); setNotice(""); }}/></label>
        <small>Não inclua a taxa aeroportuária. Milheiro exibido arredondado; custo proporcional calculado com a razão exata da compra.</small>
        {purchaseError ? <p role="status">{purchaseError}</p> : null}
      </div> : null}</> : null}</div>)}</div></fieldset>
      {inputs && totals ? <><p>{inputs.miles.toLocaleString("pt-BR")} milhas · valores totais da operação</p><CpfFinanceSummary inputs={inputs} totals={totals}/></> : <p>Financeiro não preenchido</p>}
      <div className="cpf-actions"><button className="primary-button" disabled={busy || !inputs}>{busy ? "Salvando…" : "Salvar financeiro"}</button><button type="button" className="dark-mini" disabled={busy} onClick={onClose}>Fechar</button></div>
    </form> : <button className="dark-mini" onClick={onClose}>Fechar</button>}
    <details><summary>Histórico financeiro ({history.length})</summary>{history.length ? history.map(entry => <section key={entry.revision}><p>Versão {entry.revision} · {new Date(entry.created_at).toLocaleString("pt-BR")} · {entry.actor}</p><p>{entry.inputs.miles.toLocaleString("pt-BR")} milhas · compra {money(entry.inputs.buyCents)}/milheiro · venda {money(entry.inputs.sellCents)}/milheiro</p>{entry.inputs.purchase ? <p>Compra: {money(entry.inputs.purchase.paidCents)} por {entry.inputs.purchase.receivedMiles.toLocaleString("pt-BR")} milhas, incluindo bônus.</p> : null}<CpfFinanceSummary inputs={entry.inputs} totals={entry.totals}/></section>) : <p>Nenhuma alteração financeira.</p>}</details>
  </section>;
}
