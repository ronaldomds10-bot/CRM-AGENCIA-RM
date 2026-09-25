export type HolidayType = "NATIONAL" | "STATE" | "MUNICIPAL" | "OPTIONAL";
export type HolidayVerification = "CONFIRMED" | "PROJECTED" | "MANUAL";
export type ProjectionMethod = "FIXED_ANNUAL_RECURRENCE" | "EASTER_RELATIVE" | "LEGAL_FIXED_DATE" | null;

export type HolidaySeed = {
  name: string;
  date: string;
  type: HolidayType;
  state: string | null;
  ibgeCode: string | null;
  city: string | null;
  source: "OPEN_SOURCE" | "CALCULATED" | "MANUAL";
  sourceYear: number;
  verificationStatus: HolidayVerification;
  projectionMethod: ProjectionMethod;
};

export function calculateEaster(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeLocation(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
}

const legalNational = [
  ["01-01", "Confraternização Universal"],
  ["04-21", "Tiradentes"],
  ["05-01", "Dia Mundial do Trabalho"],
  ["09-07", "Independência do Brasil"],
  ["10-12", "Nossa Senhora Aparecida"],
  ["11-02", "Finados"],
  ["11-15", "Proclamação da República"],
  ["11-20", "Dia Nacional de Zumbi e da Consciência Negra"],
  ["12-25", "Natal"],
] as const;

export function projectHolidays2027(source2026: HolidaySeed[]) {
  const easter26 = calculateEaster(2026);
  const easter27 = calculateEaster(2027);
  const movableOffsets = new Map([
    [addDays(easter26, -48), -48],
    [addDays(easter26, -47), -47],
    [addDays(easter26, -46), -46],
    [addDays(easter26, -2), -2],
    [addDays(easter26, 0), 0],
    [addDays(easter26, 60), 60],
  ]);
  const rows: HolidaySeed[] = legalNational.map(([monthDay, name]) => ({
    name, date: `2027-${monthDay}`, type: "NATIONAL", state: null, ibgeCode: null, city: null,
    source: "CALCULATED", sourceYear: 2027, verificationStatus: "CONFIRMED", projectionMethod: "LEGAL_FIXED_DATE",
  }));
  rows.push({ name: "Sexta-feira Santa", date: addDays(easter27, -2), type: "NATIONAL", state: null, ibgeCode: null, city: null, source: "CALCULATED", sourceYear: 2027, verificationStatus: "CONFIRMED", projectionMethod: "EASTER_RELATIVE" });
  for (const [name, offset] of [["Carnaval", -48], ["Carnaval", -47], ["Quarta-feira de Cinzas", -46], ["Corpus Christi", 60]] as const) {
    rows.push({ name, date: addDays(easter27, offset), type: "OPTIONAL", state: null, ibgeCode: null, city: null, source: "CALCULATED", sourceYear: 2027, verificationStatus: "CONFIRMED", projectionMethod: "EASTER_RELATIVE" });
  }
  for (const holiday of source2026) {
    if (holiday.type === "NATIONAL" || holiday.type === "OPTIONAL") continue;
    const offset = movableOffsets.get(holiday.date);
    rows.push({
      ...holiday,
      date: offset === undefined ? `2027-${holiday.date.slice(5)}` : addDays(easter27, offset),
      source: "CALCULATED",
      sourceYear: 2026,
      verificationStatus: "PROJECTED",
      projectionMethod: offset === undefined ? "FIXED_ANNUAL_RECURRENCE" : "EASTER_RELATIVE",
    });
  }
  return rows;
}

export function opportunityFor(dateIso: string) {
  const date = new Date(`${dateIso}T12:00:00Z`);
  const day = date.getUTCDay();
  if (day === 5) return { kind: "LONG_WEEKEND" as const, days: 3, start: dateIso, end: addDays(dateIso, 2) };
  if (day === 1) return { kind: "LONG_WEEKEND" as const, days: 3, start: addDays(dateIso, -2), end: dateIso };
  if (day === 4) return { kind: "POSSIBLE_BRIDGE" as const, days: 4, start: dateIso, end: addDays(dateIso, 3) };
  if (day === 2) return { kind: "POSSIBLE_BRIDGE" as const, days: 4, start: addDays(dateIso, -3), end: dateIso };
  return null;
}

export function commercialPriority(days: number) {
  if (days > 180) return "PLANEJAMENTO";
  if (days >= 120) return "PREPARAR CAMPANHA";
  if (days >= 60) return "BOA HORA PARA OFERTAR";
  if (days >= 30) return "ALTA PRIORIDADE";
  return "ÚLTIMA CHAMADA";
}
