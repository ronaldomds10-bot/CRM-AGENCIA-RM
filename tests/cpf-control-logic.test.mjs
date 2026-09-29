import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countDistinctThirdParty, nextLatamRelease, normalizeValidCpf, shiftCalendarMonths } from "../src/lib/cpf-control-logic.ts";

describe("controle de CPFs",()=>{
  it("preserva zeros e valida os dígitos verificadores",()=>{
    assert.equal(normalizeValidCpf("012.345.678-90"),"01234567890");
    assert.equal(normalizeValidCpf("111.111.111-11"),"");
    assert.equal(normalizeValidCpf("52998224724"),"");
  });
  it("conta CPF repetido uma vez, ignora titular/correção/liberação e separa contas",()=>{
    const rows=[
      {account_id:"a",cpf:"52998224725",issued_on:"2026-01-01",status:"emitido"},
      {account_id:"a",cpf:"52998224725",issued_on:"2026-02-01",status:"emitido"},
      {account_id:"a",cpf:"01234567890",issued_on:"2026-02-01",status:"emitido"},
      {account_id:"a",cpf:"11111111111",issued_on:"2026-02-01",status:"correcao"},
      {account_id:"a",cpf:"22222222222",issued_on:"2026-02-01",status:"emitido",released_at:"2026-03-01"},
      {account_id:"b",cpf:"33333333333",issued_on:"2026-02-01",status:"emitido"},
    ];
    assert.equal(countDistinctThirdParty(rows,"a","Smiles","01234567890","2026-02-10"),1);
    assert.equal(countDistinctThirdParty(rows,"b","Smiles","99999999999","2026-02-10"),1);
  });
  it("reinicia Smiles no ano civil e aplica janela móvel LATAM",()=>{
    const rows=[
      {account_id:"a",cpf:"52998224725",issued_on:"2025-12-31",status:"emitido"},
      {account_id:"a",cpf:"01234567890",issued_on:"2025-09-28",status:"emitido"},
      {account_id:"a",cpf:"11111111111",issued_on:"2025-09-29",status:"emitido"},
    ];
    assert.equal(countDistinctThirdParty(rows,"a","Smiles","99999999999","2026-01-01"),0);
    assert.equal(countDistinctThirdParty(rows,"a","LATAM Pass","99999999999","2026-09-29"),2);
  });
  it("usa a emissão mais recente e limita datas de ano bissexto",()=>{
    const rows=[{account_id:"a",cpf:"52998224725",issued_on:"2024-02-29",status:"emitido"},{account_id:"a",cpf:"52998224725",issued_on:"2024-04-01",status:"emitido"}];
    assert.equal(nextLatamRelease(rows),"2025-04-01");
    assert.equal(shiftCalendarMonths("2024-02-29",12),"2025-02-28");
  });
});
