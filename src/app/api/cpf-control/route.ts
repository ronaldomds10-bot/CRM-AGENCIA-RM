import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { isAgencyManager } from "@/lib/tenant";
import { isTrustedMutation, readJsonBody, RequestInputError } from "@/lib/security";
import { countDistinctThirdParty, maskCpf, nextLatamRelease, normalizeValidCpf, saopauloToday, shiftCalendarMonths } from "@/lib/cpf-control-logic";

export const runtime = "nodejs";

async function schema() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS mileage_accounts (
      id UUID PRIMARY KEY, agency_id UUID NOT NULL REFERENCES agencies(id), alias TEXT NOT NULL,
      holder_name TEXT NOT NULL, holder_cpf CHAR(11) NOT NULL, program TEXT NOT NULL CHECK(program IN ('LATAM Pass','Smiles','Azul Fidelidade')),
      member_number TEXT, azul_category TEXT, archived BOOLEAN NOT NULL DEFAULT FALSE,
      history_incomplete BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(agency_id,program,holder_cpf)
    );
    CREATE TABLE IF NOT EXISTS mileage_emissions (
      id UUID PRIMARY KEY, agency_id UUID NOT NULL REFERENCES agencies(id), account_id UUID NOT NULL REFERENCES mileage_accounts(id),
      issued_on DATE NOT NULL, locator TEXT, operating_airline TEXT, flight_on DATE, status TEXT NOT NULL DEFAULT 'emitido',
      notes TEXT, justification TEXT, created_by TEXT NOT NULL REFERENCES crm_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS mileage_emission_passengers (
      id UUID PRIMARY KEY, emission_id UUID NOT NULL REFERENCES mileage_emissions(id), name TEXT NOT NULL,
      cpf CHAR(11) NOT NULL, released_at DATE, release_reason TEXT, UNIQUE(emission_id,cpf)
    );
    CREATE INDEX IF NOT EXISTS mileage_passenger_cpf_idx ON mileage_emission_passengers(cpf);
    CREATE TABLE IF NOT EXISTS azul_beneficiaries (
      id UUID PRIMARY KEY, agency_id UUID NOT NULL REFERENCES agencies(id), account_id UUID NOT NULL REFERENCES mileage_accounts(id),
      name TEXT NOT NULL, cpf CHAR(11) NOT NULL, effective_on DATE NOT NULL, status TEXT NOT NULL DEFAULT 'ativo',
      removed_on DATE, inclusion_type TEXT NOT NULL DEFAULT 'inicial', release_on DATE, release_reason TEXT,
      is_child BOOLEAN NOT NULL DEFAULT FALSE, relationship_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
      exemption_confirmed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(account_id,cpf)
    );
    CREATE TABLE IF NOT EXISTS mileage_rules (
      id UUID PRIMARY KEY, agency_id UUID NOT NULL REFERENCES agencies(id), program TEXT NOT NULL, account_id UUID REFERENCES mileage_accounts(id),
      limit_count INTEGER NOT NULL, waiting_days INTEGER NOT NULL DEFAULT 30, source TEXT NOT NULL,
      valid_from DATE NOT NULL, checked_on DATE NOT NULL, confirmed BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE,
      changed_by TEXT NOT NULL REFERENCES crm_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE mileage_rules ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES mileage_accounts(id);
    ALTER TABLE mileage_rules ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS mileage_rules_active_idx ON mileage_rules(agency_id,program,active,valid_from DESC);
    CREATE TABLE IF NOT EXISTS mileage_audit (
      id UUID PRIMARY KEY, agency_id UUID NOT NULL REFERENCES agencies(id), actor_id TEXT NOT NULL,
      record_type TEXT NOT NULL, record_id UUID, action TEXT NOT NULL, reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

const validCpf=normalizeValidCpf;
const mask=maskCpf;
const asDate = (v: unknown) => { const value=String(v??"");if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return "";const date=new Date(`${value}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value?value:""; };
const programs = ["LATAM Pass", "Smiles", "Azul Fidelidade"];
const categories: Record<string, number> = { Básico: 7, Topázio: 8, Safira: 9, Diamante: 10, "Diamante Unique": 15 };

export async function GET(request: NextRequest) {
  const actor = await getSessionUser(request);
  if (!actor) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    await schema();
    const agency = actor.dataAgencyId;
    const [accounts, emissions, passengers, beneficiaries, rules] = await Promise.all([
      getPool().query("SELECT id,alias,holder_name,holder_cpf,program,member_number,azul_category,archived,history_incomplete FROM mileage_accounts WHERE agency_id=$1 ORDER BY created_at DESC", [agency]),
      getPool().query("SELECT e.id,e.account_id,e.issued_on,e.locator,e.operating_airline,e.flight_on,e.status,a.alias,a.program FROM mileage_emissions e JOIN mileage_accounts a ON a.id=e.account_id WHERE e.agency_id=$1 ORDER BY e.issued_on DESC", [agency]),
      getPool().query("SELECT p.id,p.emission_id,p.name,p.cpf,p.released_at,e.account_id,e.issued_on,e.status FROM mileage_emission_passengers p JOIN mileage_emissions e ON e.id=p.emission_id WHERE e.agency_id=$1", [agency]),
      getPool().query("SELECT id,account_id,name,cpf,effective_on,status,release_on,inclusion_type,is_child,relationship_confirmed,exemption_confirmed FROM azul_beneficiaries WHERE agency_id=$1 ORDER BY effective_on DESC", [agency]),
      getPool().query("SELECT program,account_id,limit_count,waiting_days,source,valid_from,checked_on,confirmed,active FROM mileage_rules WHERE agency_id=$1 ORDER BY created_at DESC", [agency]),
    ]);
    const bRows = beneficiaries.rows.map((b) => ({ ...b, cpf: mask(b.cpf.trim()) }));
    const today = saopauloToday();
    const cutoffStr=shiftCalendarMonths(today,-12);
    const cards = accounts.rows.map((a) => {
      const byCpf = new Map<string, typeof passengers.rows>();
      for (const p of passengers.rows) if (p.account_id === a.id && p.cpf.trim() !== a.holder_cpf.trim() && p.status !== "correcao" && !p.released_at && (a.program === "LATAM Pass" ? p.issued_on >= cutoffStr : a.program === "Smiles" ? String(p.issued_on).slice(0,4) === today.slice(0,4) : false)) byCpf.set(p.cpf.trim(), [...(byCpf.get(p.cpf.trim()) || []), p]);
      const rule = rules.rows.find((r) => r.program === a.program && r.account_id === a.id && r.active) || rules.rows.find((r) => r.program === a.program && !r.account_id && r.active);
      const limit = Number(rule?.limit_count ?? (a.program === "LATAM Pass" ? 24 : a.program === "Smiles" ? 25 : 0));
      const azul = beneficiaries.rows.filter((b) => b.account_id === a.id && b.status === "ativo" && !(b.is_child && b.relationship_confirmed && b.exemption_confirmed));
      const used = a.program === "Azul Fidelidade" ? azul.length : countDistinctThirdParty(passengers.rows,a.id,a.program,a.holder_cpf,today);
      const releases = [...byCpf.values()].map(nextLatamRelease).filter((date):date is string=>Boolean(date&&date>=today)).sort();
      return { account_id:a.id,program:a.program,alias:a.alias,holder_name:a.holder_name,holder_cpf:mask(a.holder_cpf.trim()),used,limit,remaining:Math.max(0,limit-used),percent:limit?used/limit:0,next_release:a.program === "LATAM Pass" ? releases[0] || null : null,rule_pending:a.program === "Azul Fidelidade" ? !rule||!rule.confirmed : false,history_incomplete:a.history_incomplete,cpf_rows:[...byCpf.entries()].map(([cpf,rows])=>({cpf:mask(cpf),first:rows.map(p=>p.issued_on).sort()[0],last:rows.map(p=>p.issued_on).sort().at(-1),emissions:rows.length,release:a.program === "LATAM Pass" ? nextLatamRelease(rows) : null})),azul_beneficiaries:bRows.filter((b)=>b.account_id===a.id)};
    });
    return NextResponse.json({ accounts:accounts.rows.map(a=>({...a,holder_cpf:mask(a.holder_cpf.trim())})), emissions:emissions.rows, passengers:passengers.rows.map(p=>({...p,cpf:mask(p.cpf.trim())})), beneficiaries:bRows, rules:rules.rows, cards, canManage:isAgencyManager(actor) }, { headers:{"Cache-Control":"no-store"} });
  } catch { return NextResponse.json({ error:"Não foi possível carregar o controle de CPFs." }, { status:503 }); }
}

export async function POST(request: NextRequest) {
  if (!isTrustedMutation(request)) return NextResponse.json({error:"Requisição não permitida."},{status:403});
  const actor=await getSessionUser(request); if(!actor)return NextResponse.json({error:"Não autorizado."},{status:401});
  try {
    const body=await readJsonBody<Record<string,unknown>>(request,128*1024); await schema();
    const agency=actor.dataAgencyId, action=String(body.action||"");
    if(action==="reveal") {
      if(!isAgencyManager(actor))return NextResponse.json({error:"Acesso restrito ao administrador."},{status:403});
      const reason=String(body.reason||"").trim(); if(reason.length<5)throw new RequestInputError("Informe o motivo da consulta.");
      let recordType="passenger",cpf="",recordId=String(body.id||"");
      if(body.kind==="holder"){recordType="account";const r=await getPool().query("SELECT holder_cpf AS cpf,id FROM mileage_accounts WHERE id=$1 AND agency_id=$2",[recordId,agency]);cpf=r.rows[0]?.cpf?.trim()||"";}
      else if(body.kind==="beneficiary"){recordType="beneficiary";const r=await getPool().query("SELECT cpf,id FROM azul_beneficiaries WHERE id=$1 AND agency_id=$2",[recordId,agency]);cpf=r.rows[0]?.cpf?.trim()||"";}
      else {const r=await getPool().query("SELECT p.cpf,p.id FROM mileage_emission_passengers p JOIN mileage_emissions e ON e.id=p.emission_id WHERE p.id=$1 AND e.agency_id=$2",[recordId,agency]);cpf=r.rows[0]?.cpf?.trim()||"";}
      if(!cpf)throw new RequestInputError("Registro não encontrado.",404);
      await getPool().query("INSERT INTO mileage_audit(id,agency_id,actor_id,record_type,record_id,action,reason) VALUES($1,$2,$3,$4,$5,'cpf-revealed',$6)",[randomUUID(),agency,actor.id,recordType,recordId,reason]); return NextResponse.json({cpf});
    }
    if(action==="account") {
      if(!isAgencyManager(actor))return NextResponse.json({error:"Acesso restrito ao administrador."},{status:403});
      let cpf=validCpf(body.holderCpf); const program=String(body.program||""); const alias=String(body.alias||"").trim(), holder=String(body.holderName||"").trim();
      if(body.id&&!String(body.holderCpf||"")){const current=await getPool().query("SELECT holder_cpf FROM mileage_accounts WHERE id=$1 AND agency_id=$2",[body.id,agency]);if(!current.rowCount)throw new RequestInputError("Conta não encontrada.",404);cpf=String(current.rows[0].holder_cpf).trim();}
      if(!cpf||String(body.holderCpf||"")&&!validCpf(body.holderCpf)||!programs.includes(program)||!alias||alias.length>120||!holder||holder.length>120||(program==="Azul Fidelidade"&&!Object.hasOwn(categories,String(body.azulCategory||"Básico"))))throw new RequestInputError("Preencha a conta e informe um CPF válido.");
      if(body.id){const old=await getPool().query("SELECT program,holder_cpf,EXISTS(SELECT 1 FROM mileage_emissions WHERE account_id=mileage_accounts.id) OR EXISTS(SELECT 1 FROM azul_beneficiaries WHERE account_id=mileage_accounts.id) AS has_history FROM mileage_accounts WHERE id=$1 AND agency_id=$2",[body.id,agency]);if(!old.rowCount)throw new RequestInputError("Conta nao encontrada.",404);if(old.rows[0].has_history&&(old.rows[0].program!==program||String(old.rows[0].holder_cpf).trim()!==cpf))throw new RequestInputError("Programa e titular nao podem mudar apos existir historico.");await getPool().query("UPDATE mileage_accounts SET alias=$1,holder_name=$2,holder_cpf=$3,program=$4,member_number=$5,azul_category=$6,history_incomplete=$7 WHERE id=$8 AND agency_id=$9",[alias,holder,cpf,program,String(body.memberNumber||"").trim()||null,String(body.azulCategory||"")||null,body.historyIncomplete===true,body.id,agency]);}
      else await getPool().query("INSERT INTO mileage_accounts(id,agency_id,alias,holder_name,holder_cpf,program,member_number,azul_category,history_incomplete) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[randomUUID(),agency,alias,holder,cpf,program,String(body.memberNumber||"").trim()||null,String(body.azulCategory||"")||null,body.historyIncomplete===true]);
      return NextResponse.json({ok:true});
    }
    if(action==="archive") { if(!isAgencyManager(actor))return NextResponse.json({error:"Acesso restrito ao administrador."},{status:403}); const r=await getPool().query("UPDATE mileage_accounts SET archived=$1 WHERE id=$2 AND agency_id=$3",[body.archived===true,body.id,agency]); return NextResponse.json({ok:!!r.rowCount}); }
    if(action==="emission") {
      const account=await getPool().query("SELECT * FROM mileage_accounts WHERE id=$1 AND agency_id=$2 AND archived=FALSE",[body.accountId,agency]); if(!account.rowCount)throw new RequestInputError("Conta de origem inválida.");
      const issued=asDate(body.issuedOn), passengers=Array.isArray(body.passengers)?body.passengers as Array<{name:string;cpf:string}>:[], cps=passengers.map(p=>validCpf(p.cpf));
      if(!issued||!cps.length||cps.some((x)=>!x)||new Set(cps).size!==cps.length||passengers.some(p=>!String(p.name||"").trim()))throw new RequestInputError("Informe data, nome e CPF válido para cada passageiro, sem repetição.");
      const status=String(body.status||"emitido"); if(!["emitido","cancelado","correcao"].includes(status))throw new RequestInputError("Status inválido.");
      const justification=String(body.justification||"").trim(); if(status!=="emitido"&&!justification)throw new RequestInputError("Justificativa obrigatória para cancelamento ou correção.");
      if(String(body.locator||"").length>100||String(body.airline||"").length>120||String(body.notes||"").length>5000||justification.length>2000)throw new RequestInputError("Algum campo excede o tamanho permitido.");
      if(String(body.locator||"").trim()){const dupe=await getPool().query("SELECT 1 FROM mileage_emissions WHERE agency_id=$1 AND account_id=$2 AND UPPER(locator)=UPPER($3) AND status<>'correcao' LIMIT 1",[agency,body.accountId,String(body.locator).trim()]);if(dupe.rowCount)throw new RequestInputError("Já existe emissão com esse localizador nesta conta.",409);}
      const id=randomUUID(), client=await getPool().connect(); try { await client.query("BEGIN"); await client.query("INSERT INTO mileage_emissions(id,agency_id,account_id,issued_on,locator,operating_airline,flight_on,status,notes,justification,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[id,agency,body.accountId,issued,String(body.locator||"").trim()||null,String(body.airline||"").trim()||null,asDate(body.flightOn)||null,status,String(body.notes||"").trim()||null,justification||null,actor.id]); for(let i=0;i<passengers.length;i++)await client.query("INSERT INTO mileage_emission_passengers(id,emission_id,name,cpf) VALUES($1,$2,$3,$4)",[randomUUID(),id,String(passengers[i].name||"").trim().slice(0,120)||"Passageiro",cps[i]]); await client.query("INSERT INTO mileage_audit(id,agency_id,actor_id,record_type,record_id,action,reason) VALUES($1,$2,$3,'emission',$4,$5,$6)",[randomUUID(),agency,actor.id,id,status,justification||null]); await client.query("COMMIT"); } catch(e){ await client.query("ROLLBACK"); if((e as {code?:string}).code==="23505")throw new RequestInputError("CPF repetido nesta emissão."); throw e; } finally{client.release();}
      const analysis=await Promise.all(passengers.map(async (p,i)=>({name:p.name,status:cps[i]===account.rows[0].holder_cpf?"Titular: não ocupa vaga":await awaitStatus(cps[i],String(body.accountId),agency)})));
      return NextResponse.json({ok:true,analysis});
    }
    if(action==="beneficiary") {
      if(!isAgencyManager(actor))return NextResponse.json({error:"Acesso restrito ao administrador."},{status:403});
      const account=await getPool().query("SELECT * FROM mileage_accounts WHERE id=$1 AND agency_id=$2 AND program='Azul Fidelidade'",[body.accountId,agency]); if(!account.rowCount)throw new RequestInputError("Conta Azul inválida.");
      const cpf=validCpf(body.cpf),name=String(body.name||"").trim(),effective=asDate(body.effectiveOn); if(!cpf||!name||!effective)throw new RequestInputError("Informe nome, CPF válido e data efetiva.");
      const child=body.isChild===true, confirmed=child&&body.relationshipConfirmed===true&&body.exemptionConfirmed===true, inclusion=body.inclusionType==="substituicao"?"substituicao":"inicial";
      const waitRule=await getPool().query("SELECT waiting_days FROM mileage_rules WHERE agency_id=$1 AND program='Azul Fidelidade' AND (account_id=$2 OR account_id IS NULL) AND active=TRUE ORDER BY (account_id IS NOT NULL) DESC,valid_from DESC LIMIT 1",[agency,body.accountId]);
      const releaseDate=new Date(`${effective}T12:00:00`); if(inclusion==="substituicao"&&!confirmed)releaseDate.setDate(releaseDate.getDate()+Number(waitRule.rows[0]?.waiting_days??30));
      const id=randomUUID(); await getPool().query("INSERT INTO azul_beneficiaries(id,agency_id,account_id,name,cpf,effective_on,inclusion_type,release_on,is_child,relationship_confirmed,exemption_confirmed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[id,agency,body.accountId,name,cpf,effective,inclusion,inclusion==="substituicao"&&!confirmed?releaseDate.toISOString().slice(0,10):null,child,body.relationshipConfirmed===true,body.exemptionConfirmed===true]); await getPool().query("INSERT INTO mileage_audit(id,agency_id,actor_id,record_type,record_id,action) VALUES($1,$2,$3,'beneficiary',$4,'created')",[randomUUID(),agency,actor.id,id]); return NextResponse.json({ok:true});
    }
    if(action==="beneficiary-update") {
      if(!isAgencyManager(actor))return NextResponse.json({error:"Acesso restrito ao administrador."},{status:403});
      const r=await getPool().query("UPDATE azul_beneficiaries SET status=$1,removed_on=$2,release_on=$3,release_reason=$4 WHERE id=$5 AND agency_id=$6 AND account_id IN(SELECT id FROM mileage_accounts WHERE agency_id=$6)",[body.status==="removido"?"removido":"ativo",asDate(body.removedOn)||null,asDate(body.releaseOn)||null,String(body.releaseReason||"").trim()||null,body.id,agency]); if(!r.rowCount)throw new RequestInputError("Beneficiário não encontrado.",404); await getPool().query("INSERT INTO mileage_audit(id,agency_id,actor_id,record_type,record_id,action,reason) VALUES($1,$2,$3,'beneficiary',$4,$5,$6)",[randomUUID(),agency,actor.id,body.id,body.status==="removido"?"removed":"updated",String(body.releaseReason||"").trim()||null]); return NextResponse.json({ok:true});
    }
    if(action==="rule") {
      if(!isAgencyManager(actor))return NextResponse.json({error:"Acesso restrito ao administrador."},{status:403});
      const program=String(body.program||""),limit=Number(body.limit),source=String(body.source||"").trim(),valid=asDate(body.validFrom),checked=asDate(body.checkedOn),waiting=Number(body.waitingDays||30),accountId=String(body.accountId||"")||null,confirmed=program==="Azul Fidelidade"?body.confirmed===true:true;
      if(!programs.includes(program)||!Number.isInteger(limit)||limit<1||limit>100||!source||!valid||!checked||waiting<0||waiting>365||(program==="Azul Fidelidade"&&!accountId))throw new RequestInputError("Regra inválida; informe conta Azul, limite, fonte e datas.");
      if(accountId){const owner=await getPool().query("SELECT id FROM mileage_accounts WHERE id=$1 AND agency_id=$2 AND program=$3",[accountId,agency,program]);if(!owner.rowCount)throw new RequestInputError("Conta não pertence à agência.");}
      await getPool().query("UPDATE mileage_rules SET active=FALSE WHERE agency_id=$1 AND program=$2 AND account_id IS NOT DISTINCT FROM $3::uuid",[agency,program,accountId]); await getPool().query("INSERT INTO mileage_rules(id,agency_id,program,account_id,limit_count,waiting_days,source,valid_from,checked_on,confirmed,changed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[randomUUID(),agency,program,accountId,limit,waiting,source,valid,checked,confirmed,actor.id]); await getPool().query("INSERT INTO mileage_audit(id,agency_id,actor_id,record_type,action,reason) VALUES($1,$2,$3,'rule','changed',$4)",[randomUUID(),agency,actor.id,`${program}; limite ${limit}; ${source}`]); return NextResponse.json({ok:true});
    }
    if(action==="release") {
      if(!isAgencyManager(actor))return NextResponse.json({error:"Acesso restrito ao administrador."},{status:403});
      const date=asDate(body.date),reason=String(body.reason||"").trim(); if(!date||reason.length<5)throw new RequestInputError("Informe a data e a confirmação do programa.");
      const r=await getPool().query("UPDATE mileage_emission_passengers p SET released_at=$1,release_reason=$2 FROM mileage_emissions e WHERE p.id=$3 AND p.emission_id=e.id AND e.agency_id=$4",[date,reason,body.passengerId,agency]); if(!r.rowCount)throw new RequestInputError("Passageiro não encontrado.",404); await getPool().query("INSERT INTO mileage_audit(id,agency_id,actor_id,record_type,action,reason) VALUES($1,$2,$3,'passenger','release-confirmed',$4)",[randomUUID(),agency,actor.id,reason]); return NextResponse.json({ok:true});
    }
    throw new RequestInputError("Ação inválida.");
  } catch(error) { if(error instanceof RequestInputError)return NextResponse.json({error:error.message},{status:error.status}); if((error as {code?:string}).code==="23505")return NextResponse.json({error:"Registro duplicado nesta agência."},{status:409}); return NextResponse.json({error:"Não foi possível salvar o controle de CPFs."},{status:500}); }
}

async function awaitStatus(cpf:string,accountId:string,agency:string) {
  const r=await getPool().query("SELECT program,holder_cpf FROM mileage_accounts WHERE id=$1 AND agency_id=$2",[accountId,agency]); if(!r.rowCount)return "CPF novo"; if(String(r.rows[0].holder_cpf).trim()===cpf)return "Titular: não ocupa vaga";
  const today=saopauloToday(),currentYear=today.slice(0,4),cutoffDate=shiftCalendarMonths(today,-12);
  const prior=await getPool().query("SELECT 1 FROM mileage_emission_passengers p JOIN mileage_emissions e ON e.id=p.emission_id WHERE e.account_id=$1 AND e.agency_id=$2 AND p.cpf=$3 AND e.status<>'correcao' AND p.released_at IS NULL AND ($4='LATAM Pass' AND e.issued_on >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '12 months' OR $4='Smiles' AND EXTRACT(YEAR FROM e.issued_on)=$5) LIMIT 1",[accountId,agency,cpf,r.rows[0].program,currentYear]); if(prior.rowCount)return "CPF já contabilizado nesta conta";
  if(r.rows[0].program==="Azul Fidelidade"){const ben=await getPool().query("SELECT release_on,is_child,relationship_confirmed,exemption_confirmed FROM azul_beneficiaries WHERE account_id=$1 AND cpf=$2 AND status='ativo'",[accountId,cpf]);if(ben.rowCount&&ben.rows[0].is_child&&ben.rows[0].relationship_confirmed&&ben.rows[0].exemption_confirmed)return "Isento confirmado pelo programa";if(ben.rowCount&&ben.rows[0].release_on&&String(ben.rows[0].release_on)>=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date()))return "Beneficiário em carência";}
  const rule=await getPool().query("SELECT limit_count FROM mileage_rules WHERE agency_id=$1 AND program=$2 AND (account_id=$3 OR account_id IS NULL) AND active=TRUE AND confirmed=TRUE ORDER BY (account_id IS NOT NULL) DESC,valid_from DESC LIMIT 1",[agency,r.rows[0].program,accountId]);
  if(r.rows[0].program==="Azul Fidelidade"){const used=await getPool().query("SELECT COUNT(*) FROM azul_beneficiaries WHERE account_id=$1 AND status='ativo' AND NOT(is_child AND relationship_confirmed AND exemption_confirmed)",[accountId]);return rule.rowCount&&Number(used.rows[0].count)>=Number(rule.rows[0].limit_count)?"Conta sem vagas":"Novo CPF";}
  if(rule.rowCount){const used=await getPool().query("SELECT COUNT(DISTINCT p.cpf) FROM mileage_emission_passengers p JOIN mileage_emissions e ON e.id=p.emission_id WHERE e.account_id=$1 AND e.status<>'correcao' AND p.released_at IS NULL AND p.cpf<>(SELECT holder_cpf FROM mileage_accounts WHERE id=$1) AND (($2='LATAM Pass' AND e.issued_on >= $3::date) OR ($2='Smiles' AND EXTRACT(YEAR FROM e.issued_on)=$4))",[accountId,r.rows[0].program,cutoffDate,currentYear]);if(Number(used.rows[0].count)>=Number(rule.rows[0].limit_count))return "Conta sem vagas";}
  return "Novo CPF";
}
