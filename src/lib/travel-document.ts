export type DocumentFlight = {
  code: string;
  airline: string;
  cabinClass: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
  date: string;
  arrivalDate: string;
};

export type TravelDocument = {
  flights: DocumentFlight[];
  passengers: string[];
  passengerCount: number;
  locator: string;
};

function dateTime(value: string) {
  const match = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2})\s*[:h]\s*(\d{2})\b/i);
  if (!match) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return { date: `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`, time: `${match[4].padStart(2, "0")}:${match[5]}` };
}

function cityKey(place: string) {
  return (place.split(" - ").slice(1).join(" - ") || place).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function returnFlightIndex(flights: Array<{ from: string; to: string; date: string }>) {
  if (flights.length < 2) return -1;
  if (flights.every((flight) => !flight.date)) {
    return flights.findIndex((flight, index) => index > 0 && flight.to === flights[index - 1].from);
  }
  const originCity = cityKey(flights[0].from);
  const finalCity = cityKey(flights[flights.length - 1].to);
  if (originCity === finalCity) {
    if (flights.length === 2) return 1;
    const gaps = flights.slice(1).map((flight, index) => Date.parse(flight.date) - Date.parse(flights[index].date));
    const longestGap = Math.max(...gaps.filter(Number.isFinite));
    if (longestGap > 0) return gaps.findIndex((gap) => gap === longestGap) + 1;
  }
  return flights.findIndex((flight, position) => position > 0 && flight.to === flights[0].from && (!flight.date || !flights[0].date || flight.date > flights[0].date));
}

// Smiles presents the dated itinerary first, then repeats each leg with its flight number.
// Requiring both dated airport pairs and the ticket labels avoids guessing from unrelated PDFs.
export function parseSmilesDocument(rawText: string): TravelDocument | null {
  const text = rawText.normalize("NFKC").replace(/\r/g, "");
  if (!/\bLocalizador\b/i.test(text) || !/\bVOO\s*\d+/i.test(text)) return null;
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const airportAt = (index: number) => /^[A-Z]{3}$/.test(lines[index] || "") && Boolean(dateTime(lines[index + 2] || ""));
  const flights: DocumentFlight[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!airportAt(index)) continue;
    const arrivalIndex = Array.from({ length: 7 }, (_, offset) => index + offset + 3)
      .find((candidate) => airportAt(candidate) && lines.slice(index + 3, candidate).some((line) => /\bDIRETO\b/i.test(line)));
    if (arrivalIndex === undefined) continue;
    const departure = dateTime(lines[index + 2])!;
    const arrival = dateTime(lines[arrivalIndex + 2])!;
    flights.push({
      code: "", airline: "", cabinClass: lines.slice(arrivalIndex + 3, arrivalIndex + 6).find((line) => /^Cabine\s+/i.test(line))?.replace(/^Cabine\s+/i, "") || "",
      from: `${lines[index]} - ${lines[index + 1]}`,
      to: `${lines[arrivalIndex]} - ${lines[arrivalIndex + 1]}`,
      departTime: departure.time, arriveTime: arrival.time,
      date: departure.date, arrivalDate: arrival.date,
    });
    index = arrivalIndex + 2;
  }
  if (!flights.length) return null;
  for (const match of text.matchAll(/\bVOO\s*([A-Z]{0,2}\s*\d{2,5})\b/gi)) {
    const route = text.slice(match.index + match[0].length, match.index + match[0].length + 150).match(/\b([A-Z]{3})\s*\/\s*([A-Z]{3})\b/);
    if (!route) continue;
    const flight = flights.find((item) => item.from.startsWith(`${route[1]} -`) && item.to.startsWith(`${route[2]} -`) && !item.code);
    if (flight) flight.code = match[1].replace(/\s+/g, "").trim().toUpperCase();
  }
  const locator = text.match(/\bLocalizador\s*:?\s*([A-Z0-9]{6,8})\b/i)?.[1]
    || text.match(/\n([A-Z0-9]{6,8})\n(?:SEG|TER|QUA|QUI|SEX|SAB|DOM)\n/i)?.[1] || "";
  const passengerCount = Number(text.match(/\b(\d+)\s+passageiros?\b/i)?.[1] || 0);
  const passengerBlock = text.match(/Passageiros\s*Bagagens[\s\S]*?Assento\s*\n([\s\S]*?)(?=\nComprar\s*\n?bagagem|\n(?:SEG|TER|QUA|QUI|SEX|SAB|DOM)\n|$)/i)?.[1] || "";
  const passengers: string[] = [];
  for (const rawLine of passengerBlock.split("\n")) {
    const line = rawLine.trim();
    if (!line || !/^[A-ZÀ-Ý ]+$/.test(line)) continue;
    const startsName = line.split(/\s+/).length >= 2 &&
      (rawLine !== line || (passengers.length < passengerCount && !/^(?:DE|DO|DA|DOS|DAS)$/i.test(line.split(/\s+/)[0])));
    if (startsName || !passengers.length) passengers.push(line);
    else passengers[passengers.length - 1] += ` ${line}`;
  }
  return { flights, passengers: passengers.slice(0, passengerCount || undefined), passengerCount: passengerCount || passengers.length, locator };
}
