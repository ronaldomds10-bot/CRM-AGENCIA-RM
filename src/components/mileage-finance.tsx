"use client";
import { useEffect, useState } from "react";
import { calculateMileageFinance, type MileageFinance } from "@/lib/mileage-finance";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Account = { id: string; alias: string; program: string; acquisition_thousand_cents: string | null };
type Entry = { id: string; actor: string; created_at: string; before_value: { finance: MileageFinance; status: string } | null; after_value: { finance: MileageFinance; status: string } | null };
export function MileageFinanceEditor({ id, value, onChange }: { id: string; value?: MileageFinance; onChange: (value: MileageFinance) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [history, setHistory] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<Partial<MileageFinance>>(value || {});
  const [chargedEdited, setChargedEdited] = useState(Boolean(value));
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/issues/finance?id=${encodeURIComponent(id)}`).then(async response => {
      if (!response.ok) throw new Error("Não foi possível carregar contas e histórico.");
      return response.json();
    }).then(data => { if (active) { setAccounts(data.accounts); setHistory(data.history); setError(""); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, revision]);
  const update = (patch: Partial<MileageFinance>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    try { calculateMileageFinance(next as MileageFinance); onChange(next as MileageFinance); } catch { /* Incomplete input remains pending. */ }
  };
  let totals: ReturnType<typeof calculateMileageFinance> | null = null;
  try { totals = calculateMileageFinance(draft as MileageFinance); } catch { /* Pending */ }
  const fields = [["miles", "Milhas utilizadas (total)"], ["buyCents", "Compra do milheiro (R$/1.000)"], ["sellCents", "Venda do milheiro (R$/1.000)"], ["paidFeeCents", "Taxa aeroportuária paga (R$)"], ["chargedFeeCents", "Taxa aeroportuária cobrada (R$)"], ["otherCents", "Outros custos (R$, opcional)"]] as const;
  return <div className="mileage-finance grid gap-4">
    <p>Milhas e valores são totais da emissão, incluindo todos os passageiros.</p>
    {loading ? <p role="status">Carregando contas e histórico…</p> : null}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button></p> : null}
    <label>Conta de origem<select className="input" value={draft.accountId || ""} onChange={e => {
      const account = accounts.find(a => a.id === e.target.value);
      update({ accountId: e.target.value, otherCents: draft.otherCents ?? 0, ...(draft.buyCents === undefined && account?.acquisition_thousand_cents != null ? { buyCents: Number(account.acquisition_thousand_cents) } : {}) });
    }}><option value="">Selecione a conta</option>{draft.accountId && !accounts.some(a => a.id === draft.accountId) ? <option value={draft.accountId}>Conta de origem salva</option> : null}{accounts.map(a => <option key={a.id} value={a.id}>{a.program} · {a.alias}</option>)}</select></label>
    {!loading && !error && !accounts.length ? <p>Cadastre uma conta no Controle de CPFs.</p> : null}
    <div className="miles-cost-grid">{fields.map(([key, label]) => <label key={key}>{label}<input className="input" type="number" min="0" max={key === "miles" ? 1000000000 : 10000000} step={key === "miles" ? "1" : "0.01"} value={draft[key] === undefined ? "" : draft[key]! / (key === "miles" ? 1 : 100)} onChange={e => {
      const number = e.target.value === "" ? undefined : Math.round(Number(e.target.value) * (key === "miles" ? 1 : 100));
      if (key === "miles" && e.target.value !== "" && !Number.isInteger(Number(e.target.value))) return;
      if (key === "chargedFeeCents") setChargedEdited(true);
      update({ [key]: number, ...(key === "paidFeeCents" && !chargedEdited ? { chargedFeeCents: number } : {}), ...(key !== "otherCents" ? { otherCents: draft.otherCents ?? 0 } : { otherCents: number ?? 0 }) });
    }}/></label>)}</div>
    {!totals ? <p role="status">Financeiro pendente — preencha todos os valores obrigatórios. Alterações incompletas não substituem o financeiro salvo.</p> : <div className="miles-cost-grid" aria-live="polite">
      {[["Custo das milhas", money(totals.milesCost)], ["Venda das milhas", money(totals.milesSale)], ["Taxa paga", money(draft.paidFeeCents!)], ["Taxa cobrada", money(draft.chargedFeeCents!)], ["Custo total", money(totals.cost)], ["Total cobrado", money(totals.revenue)], ["Lucro", money(totals.profit)], ["Margem", totals.margin === null ? "—" : `${totals.margin.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`]].map(([label, text]) => <div key={label}><small>{label}</small><strong className="block" style={label === "Lucro" ? { color: totals.profit < 0 ? "#f87171" : "#4ade80" } : undefined}>{text}</strong></div>)}
      <small>{draft.miles?.toLocaleString("pt-BR")} milhas · Taxa repassada pelo mesmo valor não gera lucro.</small>
    </div>}
    <details onToggle={e => { if (e.currentTarget.open) setRevision(n => n + 1); }}><summary>Histórico financeiro</summary>{history.length ? history.map(entry => <div key={entry.id}><p>{new Date(entry.created_at).toLocaleString("pt-BR")} · {entry.actor}</p>{[entry.before_value, entry.after_value].map((snapshot, i) => <p key={i}>{i ? "Depois" : "Antes"}: {snapshot ? `${snapshot.status} · ${snapshot.finance.miles.toLocaleString("pt-BR")} milhas · compra ${money(snapshot.finance.buyCents)} · venda ${money(snapshot.finance.sellCents)} · taxa paga ${money(snapshot.finance.paidFeeCents)} · taxa cobrada ${money(snapshot.finance.chargedFeeCents)} · outros ${money(snapshot.finance.otherCents)} · conta ${snapshot.finance.accountId}` : "Financeiro pendente / registro ausente"}</p>)}</div>) : <p>Nenhuma alteração registrada.</p>}</details>
  </div>;
}
