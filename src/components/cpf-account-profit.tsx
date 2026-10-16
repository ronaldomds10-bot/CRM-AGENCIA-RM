import { cpfAccountProfit } from "@/lib/cpf-account-profit";

export default function CpfAccountProfit({ accountId, operations }: { accountId: string; operations: Parameters<typeof cpfAccountProfit>[0] }) {
  const result = cpfAccountProfit(operations, accountId);
  return <div className="cpf-account-profit" aria-live="polite">
    <span>{result.pending && result.completed ? "Lucro acumulado (parcial)" : "Lucro acumulado"}</span>
    <strong style={result.completed && result.sign ? { color: result.sign < 0 ? "#f87171" : "#4ade80" } : undefined}>
      {result.formatted ?? (result.pending ? "Financeiro pendente" : "Sem operações emitidas")}
    </strong>
    <small>{result.completed} {result.completed === 1 ? "operação com financeiro" : "operações com financeiro"}{result.pending ? ` · ${result.pending} ${result.pending === 1 ? "pendente" : "pendentes"}` : ""}</small>
    <small>Todo o histórico desta conta · cancelamentos e correções excluídos.</small>
  </div>;
}
