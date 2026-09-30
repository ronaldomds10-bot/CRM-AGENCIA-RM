export type UsageRow = { account_id: string; cpf: string; issued_on: string | Date; status: string; released_at?: string | Date | null };

export function dateOnly(value: string | Date) {
  return value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10);
}

export function normalizeValidCpf(raw: unknown) {
  const cpf=String(raw??"").replace(/\D/g,"");
  if(cpf.length!==11||/^(\d)\1{10}$/.test(cpf))return "";
  const valid=(length:number)=>{let sum=0;for(let i=0;i<length;i++)sum+=Number(cpf[i])*(length+1-i);const digit=(sum*10)%11;return(digit===10?0:digit)===Number(cpf[length]);};
  return valid(9)&&valid(10)?cpf:"";
}

export function maskCpf(cpf:string) { return `***.***.***-${cpf.slice(-2)}`; }

export function saopauloToday(now=new Date()) {
  return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}

export function shiftCalendarMonths(isoDate:string,months:number) {
  const [year,month,day]=isoDate.slice(0,10).split("-").map(Number);
  const zeroMonth=year*12+(month-1)+months,targetYear=Math.floor(zeroMonth/12),targetMonth=((zeroMonth%12)+12)%12+1;
  const lastDay=new Date(Date.UTC(targetYear,targetMonth,0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2,"0")}-${String(Math.min(day,lastDay)).padStart(2,"0")}`;
}

export function countDistinctThirdParty(rows:UsageRow[],accountId:string,program:string,holderCpf:string,today:string) {
  const cutoff=shiftCalendarMonths(today,-12),year=today.slice(0,4),seen=new Set<string>();
  for(const row of rows){const issued=dateOnly(row.issued_on);if(row.account_id!==accountId||row.status==="correcao"||row.released_at||row.cpf.trim()===holderCpf.trim())continue;
    if(program==="LATAM Pass"&&issued<cutoff)continue;
    if(program==="Smiles"&&issued.slice(0,4)!==year)continue;
    seen.add(row.cpf.trim());
  }
  return seen.size;
}

export function nextLatamRelease(rows:UsageRow[]) {
  if(!rows.length)return null;
  return shiftCalendarMonths(rows.map(row=>dateOnly(row.issued_on)).sort().at(-1)!,12);
}
