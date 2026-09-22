export type PrintFlight = {
  code: string;
  airline: string;
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

export function parseFlightPrint(text: string): PrintFlight[] {
  const normalized = text.normalize("NFKC").toUpperCase();
  const stops = [...normalized.matchAll(/\b([A-Z]{3})\s*(\d{1,2})[:.]([0-5]\d)\b/g)]
    .map((match) => ({ airport: match[1], time: `${match[2].padStart(2, "0")}:${match[3]}` }));
  const codes = [...normalized.matchAll(/\b([A-Z][A-Z0-9])\s*[- ]?(\d{2,4})\b/g)]
    .map((match) => ({ code: `${match[1]}${match[2]}`, airline: airlineByPrefix[match[1]] }))
    .filter((item) => item.airline);
  const dateMatch = normalized.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/);
  const date = dateMatch ? dateMatch[4] ? `${dateMatch[4]}-${dateMatch[5]}-${dateMatch[6]}` : `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : "";
  const flights: PrintFlight[] = [];
  for (let index = 0; index + 1 < stops.length; index += 2) {
    const origin = stops[index];
    const destination = stops[index + 1];
    if (origin.airport === destination.airport) continue;
    const code = codes[flights.length];
    flights.push({
      code: code?.code ?? "", airline: code?.airline ?? "",
      from: origin.airport, to: destination.airport,
      departTime: origin.time, arriveTime: destination.time, date,
    });
  }
  return flights;
}
