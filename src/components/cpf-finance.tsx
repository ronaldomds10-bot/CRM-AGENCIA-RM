"use client";
import { useEffect, useState } from "react";
import { calculateMileageFinance, type MileageFinance } from "@/lib/cpf-finance";

import { CpfFinanceFields, CpfFinanceSummary, cpfFinanceDraft, readCpfFinanceDraft, emptyCpfFinance, cpfMoney as money } from "./cpf-finance-fields";

type Totals = ReturnType<typeof calculateMileageFinance>;
type History = { revision: number; inputs: MileageFinance; totals: Totals; created_at: string; actor: string };
export default function CpfFinance({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState({ ...emptyCpfFinance });
  const [account, setAccount] = useState({ id: "", alias: "" });
  const [revision, setRevision] = useState(0), [history, setHistory] = useState<History[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`/api/cpf-control/finance?id=${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error);
      setAccount({ id: data.account_id, alias: data.alias }); setRevision(data.revision); setHistory(data.history);
      setDraft(cpfFinanceDraft(data.inputs));
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, reload]);
  let inputs: MileageFinance | null = null;
  try { inputs = readCpfFinanceDraft(draft, account.id); } catch { /* Pending */ }
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
      <CpfFinanceFields value={draft} onChange={value => { setDraft(value); setNotice(""); }} accountId={account.id} disabled={busy}/>
      <div className="cpf-actions"><button className="primary-button" disabled={busy || !inputs}>{busy ? "Salvando…" : "Salvar financeiro"}</button><button type="button" className="dark-mini" disabled={busy} onClick={onClose}>Fechar</button></div>
    </form> : <button className="dark-mini" onClick={onClose}>Fechar</button>}
    <details><summary>Histórico financeiro ({history.length})</summary>{history.length ? history.map(entry => <section key={entry.revision}><p>Versão {entry.revision} · {new Date(entry.created_at).toLocaleString("pt-BR")} · {entry.actor}</p><p>{entry.inputs.miles.toLocaleString("pt-BR")} milhas · compra {money(entry.inputs.buyCents)}/milheiro · venda {money(entry.inputs.sellCents)}/milheiro</p>{entry.inputs.purchase ? <p>Compra: {money(entry.inputs.purchase.paidCents)} por {entry.inputs.purchase.receivedMiles.toLocaleString("pt-BR")} milhas, incluindo bônus.</p> : null}<CpfFinanceSummary inputs={entry.inputs} totals={entry.totals}/></section>) : <p>Nenhuma alteração financeira.</p>}</details>
  </section>;
}
