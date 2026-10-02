export type PrintFlight = {
  code: string;
  airline: string;
  cabinClass?: string;
  passengerCount?: number;
  passengerNames?: string[];
  locator?: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
  date: string;
};

const airlineByPrefix: Record<string, string> = {
  LA: "LATAM", AM: "Aeroméxico", AD: "Azul", G3: "GOL", AA: "American Airlines",
  KL: "KLM", AR: "Aerolineas Argentinas", IB: "Iberia", TP: "TAP",
};

const monthByName: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

const weekdayByName: Record<string, number> = {
  DOM: 0, SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5, SAB: 6,
};

type DatedPosition = { index: number; date: string };
type FlightStop = { index: number; airport: string; time: string };

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function inferredYear(month: number, day: number, weekday: number | undefined, now: Date) {
  if (weekday !== undefined) {
    const candidates = Array.from({ length: 5 }, (_, index) => now.getFullYear() - 1 + index)
      .filter((year) => new Date(year, month - 1, day, 12).getDay() === weekday);
    if (candidates.length) {
      return candidates.reduce((best, year) => {
        const distance = Math.abs(new Date(year, month - 1, day, 12).getTime() - now.getTime());
        const bestDistance = Math.abs(new Date(best, month - 1, day, 12).getTime() - now.getTime());
        return distance < bestDistance ? year : best;
      });
    }
  }
  const thisYear = new Date(now.getFullYear(), month - 1, day, 12);
  const staleCutoff = new Date(now.getTime() - 90 * 86400000);
  return thisYear < staleCutoff ? now.getFullYear() + 1 : now.getFullYear();
}

function findDates(text: string, now: Date): DatedPosition[] {
  const dates: DatedPosition[] = [];
  for (const match of text.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    dates.push({
      index: match.index,
      date: match[4] ? `${match[4]}-${match[5]}-${match[6]}` : `${match[3]}-${match[2]}-${match[1]}`,
    });
  }
  for (const match of text.matchAll(/\b(\d{1,2})\s*(?:DE\s+)?(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[A-Z]*\.?\s*(?:(?:DE\s+)?(\d{4}))?/g)) {
    const month = monthByName[match[2]];
    const day = Number(match[1]);
    const nearbyWeekday = text.slice(Math.max(0, match.index - 14), match.index).match(/(DOM|SEG|TER|QUA|QUI|SEX|SAB)[^A-Z]*$/)?.[1];
    const year = match[3] ? Number(match[3]) : inferredYear(month, day, nearbyWeekday ? weekdayByName[nearbyWeekday] : undefined, now);
    dates.push({ index: match.index, date: isoDate(year, month, day) });
  }
  return dates.sort((left, right) => left.index - right.index);
}

function findStops(text: string): FlightStop[] {
  const stops: FlightStop[] = [];
  const add = (index: number, airport: string, hour: string, minute: string) => {
    const stop = { index, airport, time: `${hour.padStart(2, "0")}:${minute}` };
    if (!stops.some((item) => item.airport === stop.airport && item.time === stop.time && Math.abs(item.index - stop.index) < 200)) stops.push(stop);
  };

  // Google Voos displays the time first and the IATA code at the end of the airport name.
  for (const match of text.matchAll(/\b(\d{1,2})[:.]([0-5]\d)\b[^\n]{0,220}?\(([A-Z]{3})\)/g)) {
    add(match.index, match[3], match[1], match[2]);
  }
  // Keep accepting providers that put the IATA code before the time.
  for (const match of text.matchAll(/\b([A-Z]{3})[ \t]*(\d{1,2})[:.]([0-5]\d)\b/g)) {
    add(match.index, match[1], match[2], match[3]);
  }
  // Airline and agency itinerary cards often put the time and IATA code on
  // separate lines (for example "10:25\nBSB\nBrasilia") instead of showing
  // the code in parentheses. Associate each time with the first standalone
  // airport code before the next time.
  const times = [...text.matchAll(/\b(\d{1,2})[:.]([0-5]\d)\b/g)];
  for (const [index, time] of times.entries()) {
    const nextTime = times[index + 1]?.index ?? text.length;
    const segment = text.slice(time.index + time[0].length, Math.min(nextTime, time.index + 180));
    const airport = segment.match(/^\s*[-–—]?\s*([A-Z]{3})\s*(?:\n|$)/m);
    if (airport) add(time.index, airport[1], time[1], time[2]);
  }
  return stops.sort((left, right) => left.index - right.index);
}

function findRouteBlocks(text: string, now: Date, passengerCount?: number, cabinClass?: string, passengerNames?: string[], locator?: string) {
  const routes = [...text.matchAll(/\bDE\s+[^\n]{1,120}?(?:\(|\b)([A-Z]{3})\)?\s+PARA\s+[^\n]{1,120}?(?:\(|\b)([A-Z]{3})\)?(?:\s|$)/g)];
  return routes.flatMap<PrintFlight>((route, index) => {
    const block = text.slice(route.index, routes[index + 1]?.index ?? text.length);
    const times = [...block.matchAll(/\b(\d{1,2})\s*(?:H|[:.])\s*([0-5]\d)\b/g)];
    if (times.length < 2 || route[1] === route[2]) return [];
    const codeMatch = block.match(/\b([A-Z][A-Z0-9])\s*[- ]?(\d{2,4})\b/);
    const code = codeMatch && airlineByPrefix[codeMatch[1]] ? `${codeMatch[1]}${codeMatch[2]}` : "";
    return [{
      code,
      airline: codeMatch ? airlineByPrefix[codeMatch[1]] ?? "" : "",
      cabinClass,
      passengerCount: passengerNames?.length || passengerCount,
      passengerNames,
      locator,
      from: route[1],
      to: route[2],
      departTime: `${times[0][1].padStart(2, "0")}:${times[0][2]}`,
      arriveTime: `${times[1][1].padStart(2, "0")}:${times[1][2]}`,
      date: findDates(block, now)[0]?.date ?? "",
    }];
  });
}

export function parseFlightPrint(rawText: string, now = new Date()): PrintFlight[] {
  const text = rawText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFKC").toUpperCase().replace(/\r/g, "");
  const stops = findStops(text);
  const dates = findDates(text, now);
  const codes = [...text.matchAll(/\b([A-Z][A-Z0-9])\s*[- ]?(\d{2,4})\b/g)]
    .map((match) => ({ code: `${match[1]}${match[2]}`, airline: airlineByPrefix[match[1]] }))
    .filter((item) => item.airline);
  const passengerCount = Number(text.match(/\b(\d+)\s+PASSAGEIROS?\b/)?.[1] || 0) || undefined;
  const cabinClass = /\bECONOMICA\b/.test(text) ? "Econômica" : undefined;
  const passengerName = text.match(/\n\s*([A-Z][A-Z ]{4,80})\s*\n\s*(?:ASSENTOS?|BAGAGEM)\b/)?.[1]?.trim();
  const passengerNames = passengerName ? [passengerName] : undefined;
  const locator = text.match(/(?:REFERENCIA DA RESERVA|LOCALIZADOR|RESERVA)\s*:?\s*([A-Z0-9]{5,8})\b/)?.[1];
  const routeFlights = findRouteBlocks(text, now, passengerCount, cabinClass, passengerNames, locator);
  if (routeFlights.length) return routeFlights;
  const flights: PrintFlight[] = [];

  for (let index = 0; index + 1 < stops.length; index += 2) {
    const origin = stops[index];
    const destination = stops[index + 1];
    if (origin.airport === destination.airport) continue;
    const code = codes[flights.length];
    const nearestDate = dates.filter((item) => item.index < origin.index).at(-1) ?? dates[flights.length];
    flights.push({
      code: code?.code ?? "", airline: code?.airline ?? "", cabinClass, passengerCount, passengerNames, locator,
      from: origin.airport, to: destination.airport,
      departTime: origin.time, arriveTime: destination.time, date: nearestDate?.date ?? "",
    });
  }
  return flights;
}
