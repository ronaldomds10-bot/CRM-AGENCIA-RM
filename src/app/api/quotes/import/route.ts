import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { isAuthorized } from "@/lib/auth";
import { allowRequest } from "@/lib/rate-limit";
import { parseSmilesDocument, returnFlightIndex } from "@/lib/travel-document";

export const runtime = "nodejs";
export const maxDuration = 60;

type AnyRecord = Record<string, unknown>;

const record = (value: unknown): AnyRecord => value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const items = (value: unknown): unknown[] => Array.isArray(value) ? value : Object.keys(record(value)).length ? [value] : [];
const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const valueAt = (value: unknown, ...path: string[]) => path.reduce<unknown>((current, key) => record(current)[key], value);
const datePart = (value: unknown) => text(value).slice(0, 10);
const timePart = (value: unknown) => text(value).slice(11, 16);

function clockTime(value: unknown) {
  const raw = text(value).trim();
  const twelveHour = raw.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (twelveHour) {
    const hour = (Number(twelveHour[1]) % 12) + (/PM/i.test(twelveHour[3]) ? 12 : 0);
    return `${String(hour).padStart(2, "0")}:${twelveHour[2]}`;
  }
  const direct = raw.match(/(?:T|^)(\d{2}:\d{2})/);
  return direct?.[1] || "";
}

function stripHtml(value: unknown) {
  return text(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findBooking(value: unknown): AnyRecord | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBooking(item);
      if (found) return found;
    }
    return null;
  }
  const item = record(value);
  if (Array.isArray(item.bookingPackages)) return item;
  for (const child of Object.values(item)) {
    const found = findBooking(child);
    if (found) return found;
  }
  return null;
}

function findHotelDetail(value: unknown): AnyRecord | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findHotelDetail(item);
      if (found) return found;
    }
    return null;
  }
  const item = record(value);
  if (item.checkInTime || item.checkOutTime) return item;
  for (const child of Object.values(item)) {
    const found = findHotelDetail(child);
    if (found) return found;
  }
  return null;
}

function passengerList(names: unknown, baggageList: unknown) {
  const baggage = array(baggageList).map(record);
  const checkedBags = number(baggage.find((item) => item.type === "CHECKED")?.quantity);
  const carryOnBags = number(baggage.find((item) => item.type === "CARRY_ON")?.quantity);
  const backpacks = number(baggage.find((item) => item.type === "PERSONAL_ITEM")?.quantity);
  const count = Math.max(1, array(names).length);
  return Array.from({ length: count }, (_, index) => {
    const passenger = record(array(names)[index]);
    return {
      id: crypto.randomUUID(),
      name: text(passenger.name) || text(passenger.firstName) || `Passageiro ${index + 1}`,
      surname: text(passenger.surname) || text(passenger.lastName),
      ticket: text(passenger.ticket) || text(passenger.ticketNumber),
      checkedBags,
      carryOnBags,
      backpacks,
    };
  });
}

function mapFlight(segmentValue: unknown, names: unknown) {
  const segment = record(segmentValue);
  const origin = record(segment.origin);
  const destination = record(segment.destination);
  const airline = record(segment.airline);
  const passengers = passengerList(names, segment.baggageList);
  return {
    segmentId: crypto.randomUUID(),
    code: [text(airline.code), text(segment.number)].filter(Boolean).join(" "),
    airline: text(airline.name),
    cabinClass: text(segment.class) || text(valueAt(segment, "fareFlight", "description")),
    from: [text(origin.code), text(valueAt(origin, "city", "name"))].filter(Boolean).join(" - "),
    to: [text(destination.code), text(valueAt(destination, "city", "name"))].filter(Boolean).join(" - "),
    departTime: timePart(segment.departure),
    arriveTime: timePart(segment.arrival),
    date: datePart(segment.departure),
    arrivalDate: datePart(segment.arrival),
    adults: array(names).filter((name) => record(name).type === "ADT").length,
    children: array(names).filter((name) => record(name).type !== "ADT").length,
    bags: passengers.reduce((sum, passenger) => sum + passenger.checkedBags, 0),
    passengers,
    checkedBags: passengers.reduce((sum, passenger) => sum + passenger.checkedBags, 0),
    carryOnBags: passengers.reduce((sum, passenger) => sum + passenger.carryOnBags, 0),
    backpacks: passengers.reduce((sum, passenger) => sum + passenger.backpacks, 0),
    checkedBagWeight: 23,
    carryOnWeight: 10,
    pets: 0,
    refundable: false,
  };
}

function mapHotel(value: unknown) {
  const bookingHotel = record(value);
  const hotel = record(bookingHotel.hotel);
  const room = record(array(bookingHotel.rooms)[0]);
  const names = array(room.names);
  const checkin = text(room.checkIn) || text(room.checkin) || text(bookingHotel.checkIn);
  const checkout = text(room.checkOut) || text(room.checkout) || text(bookingHotel.checkOut);
  const roomNumbers = new Set(names.map((name) => number(record(name).roomNumber)).filter(Boolean));
  return {
    name: text(hotel.name),
    address: text(valueAt(hotel, "address", "address")),
    checkin: datePart(checkin),
    checkout: datePart(checkout),
    checkinTime: clockTime(hotel.checkInTime) || clockTime(checkin),
    checkoutTime: clockTime(hotel.checkOutTime) || clockTime(checkout),
    rooms: roomNumbers.size || (room ? 1 : 0),
    guests: names.length,
    breakfast: /caf[eé]|breakfast/i.test(text(valueAt(room, "boardType", "name"))),
    refundable: Boolean(valueAt(room, "cancellationPolicies", "refundable")),
  };
}

function fareTotal(value: unknown) {
  return array(record(value).fares)
    .map(record)
    .filter((fare) => fare.type === "FARE")
    .reduce((sum, fare) => sum + number(valueAt(fare, "price", "amount")), 0);
}

function serviceSource(value: AnyRecord) {
  for (const key of ["servicePackage", "tour", "experience", "circuit", "service", "transfer"]) {
    const candidate = record(value[key]);
    if (Object.keys(candidate).length) return candidate;
  }
  return value;
}

function mapTour(value: unknown) {
  const wrapper = record(value);
  const source = serviceSource(wrapper);
  return {
    name: text(source.name) || text(source.title) || "Passeio importado",
    provider: text(source.provider) || text(valueAt(source, "providerDetail", "name")) || text(wrapper.provider),
    date: datePart(source.date) || datePart(wrapper.date),
    description: stripHtml(source.description),
    observation: text(source.observation) || stripHtml(wrapper.observation),
    price: fareTotal(wrapper) || fareTotal(source),
    travelers: array(wrapper.names).length || array(source.names).length,
    refundable: Boolean(valueAt(wrapper, "cancellationPolicies", "refundable")),
  };
}

function mapCar(value: unknown) {
  const wrapper = record(value);
  const source = record(wrapper.vehicle ?? wrapper.car ?? wrapper.rentalCar ?? wrapper);
  const pickup = text(source.pickupDate) || text(source.pickUpDate) || text(source.startDate) || text(wrapper.startDate);
  const dropoff = text(source.returnDate) || text(source.dropOffDate) || text(source.endDate) || text(wrapper.endDate);
  const pickupAddress = text(source.pickupAddress) || text(source.pickUpLocation) || text(valueAt(source, "pickupLocation", "name"));
  const returnAddress = text(source.returnAddress) || text(source.dropOffLocation) || text(valueAt(source, "returnLocation", "name"));
  const details = [text(source.name), text(source.model), text(source.category), stripHtml(source.description)].filter(Boolean).join(" ");
  return {
    pickupDate: datePart(pickup), returnDate: datePart(dropoff), pickupTime: timePart(pickup), returnTime: timePart(dropoff),
    pickupAddress, returnAddress, models: text(source.name) || text(source.model) || text(source.category),
    passengers: number(source.passengers) || number(source.capacity), doors: number(source.doors),
    sameLocation: Boolean(pickupAddress && pickupAddress === returnAddress),
    airConditioning: /ar.?condicionado|air.?condition/i.test(details), airbag: /airbag/i.test(details), abs: /\bABS\b/i.test(details),
    electricWindows: /vidros? elétricos?/i.test(details), electricLocks: /travas? elétricas?/i.test(details),
    powerSteering: /direção (elétrica|hidráulica)/i.test(details), automatic: /automátic/i.test(details),
    refundable: Boolean(valueAt(wrapper, "cancellationPolicies", "refundable")),
  };
}

function mapInsurance(value: unknown) {
  const wrapper = record(value);
  const source = record(wrapper.insurance ?? wrapper.travelInsurance ?? wrapper);
  return {
    provider: text(wrapper.provider) || text(source.provider) || text(valueAt(source, "providerDetail", "name")),
    plan: text(source.name) || text(source.plan) || text(source.title),
    description: stripHtml(source.description) || stripHtml(wrapper.textDoc),
    travelers: array(wrapper.names).length || array(source.names).length,
    price: fareTotal(wrapper) || fareTotal(source),
  };
}

function mapInfoTravelBooking(booking: AnyRecord) {
  const packages = array(booking.bookingPackages).map(record);
  const hotels = packages.flatMap((item) => items(item.bookingHotels)).map(mapHotel);
  const flightBookings = packages.flatMap((item) => items(item.bookingFlights)).map(record);
  const journeys = flightBookings.flatMap((item) => array(item.flights).map((flight) => ({ flight: record(flight), names: item.names })));
  const mappedJourneys = journeys.map(({ flight, names }) => {
    const segments = array(flight.segments);
    return (segments.length ? segments : [flight]).map((segment) => mapFlight(segment, names));
  });
  const serviceKeys = ["bookingServicePackages", "bookingTours", "bookingServiceOthers", "bookingExperiences", "bookingCircuits", "bookingTransfers"];
  const tours = packages.flatMap((item) => serviceKeys.flatMap((key) => items(item[key]))).map(mapTour);
  const cars = packages.flatMap((item) => items(item.bookingVehicles)).map(mapCar);
  const insurances = packages.flatMap((item) => items(item.bookingInsurances)).map(mapInsurance);
  const firstOutbound = mappedJourneys[0] ?? [];
  const firstReturn = mappedJourneys[1] ?? [];
  const allDates = [
    ...hotels.flatMap((hotel) => [hotel.checkin, hotel.checkout]),
    ...mappedJourneys.flat().flatMap((flight) => [flight.date, flight.arrivalDate]),
    ...tours.map((tour) => tour.date),
  ].filter(Boolean).sort();
  const outbound = firstOutbound[0];
  const returning = firstReturn[0];
  const firstPassenger = record(array(flightBookings[0]?.names)[0]);
  const destination = outbound?.to.split(" - ").slice(1).join(" - ") || hotels[0]?.address.split(",").at(-2)?.trim() || tours[0]?.name || "";
  const paymentText = stripHtml(booking.textDoc);
  return {
    name: `Orçamento ${number(booking.id) || "importado"}`,
    client: [text(firstPassenger.name) || text(firstPassenger.firstName), text(firstPassenger.surname) || text(firstPassenger.lastName)].filter(Boolean).join(" "),
    destination,
    route: [outbound?.from.split(" - ")[0], outbound?.to.split(" - ")[0], returning?.to.split(" - ")[0]].filter(Boolean).join(" → "),
    startDate: allDates[0] || "",
    endDate: allDates.at(-1) || "",
    cashPrice: number(valueAt(booking, "bookingAmount", "amount")),
    showValues: true,
    notes: "",
    paymentOption: /10x\s+sem\s+juros/i.test(paymentText) ? "Até 10x sem juros" : "",
    flightOut: outbound,
    flightOutSegments: firstOutbound.slice(1),
    flightBack: returning,
    flightBackSegments: firstReturn.slice(1),
    hotel: hotels[0],
    hotelOptions: hotels.slice(1),
    car: cars[0],
    carOptions: cars.slice(1),
    insurance: insurances[0],
    insuranceOptions: insurances.slice(1),
    tours,
  };
}

function embeddedInfoTravelUrl(buffer: Buffer, parsedText: string) {
  const source = `${parsedText}\n${buffer.toString("latin1")}`.replace(/\\\r?\n/g, "").replace(/\\([()\\])/g, "$1");
  const host = source.match(/https?:\/\/[a-z0-9.-]*infotravel\.com\.br/i)?.[0] || "https://premium.infotravel.com.br";
  const candidates = [
    ...Array.from(source.matchAll(/token(?:=|%3D)([A-Za-z0-9+/_=%-]{24,})/gi), (match) => match[1]),
    ...Array.from(source.matchAll(/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g), (match) => match[0]),
  ];
  for (const candidate of candidates) {
    let token = candidate.split(/%26|&/i)[0].replace(/\\/g, "");
    try { token = decodeURIComponent(token); } catch { /* mantém valor original */ }
    if (/^[^|]+\|\s*\d+\s*\|/.test(Buffer.from(token, "base64").toString("utf8"))) {
      return `${host}/orcamento-web/pt/link?token=${encodeURIComponent(token)}`;
    }
  }
  return "";
}

function parseBrazilianDate(value: string) {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function parseMoney(value: string) {
  return Number(value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
}

function dateWithYear(value: string, fallbackYear: string) {
  const match = value.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!match) return "";
  const yearValue = match[3] || fallbackYear;
  const year = yearValue.length === 2 ? `20${yearValue}` : yearValue;
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function pdfFlight(direction: string, date: string, departTime: string, from: string, arriveTime: string, to: string, adults: number) {
  const passengers = passengerList(Array.from({ length: adults }, () => ({ type: "ADT" })), []);
  return {
    segmentId: crypto.randomUUID(), code: "", airline: "", cabinClass: "", from, to, departTime, arriveTime, date, arrivalDate: date,
    adults, children: 0, bags: 0, passengers, checkedBags: 0, carryOnBags: 0, backpacks: 0,
    checkedBagWeight: 23, carryOnWeight: 10, pets: 0, refundable: false, direction,
  };
}

function mapBoardingPassText(clean: string) {
  if (!/cart[aã]o de embarque/i.test(clean)) return null;
  const route = clean.match(/\n([A-Z]{3})\n([^\n]+)\n(\d{2}:\d{2})\nVoo\s*\n?([A-Z0-9 -]{2,12})\n([A-Z]{3})\n([^\n]+)\n(\d{2}:\d{2})/i);
  if (!route) return null;
  const travelDate = parseBrazilianDate(clean.match(/(?:segunda|ter[çc]a|quarta|quinta|sexta|s[aá]bado|domingo)[^\d]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] || "");
  const labeledPassenger = clean.match(/(?:Passageiro|Passenger|Nome)\s*:?\s*([^\n]+)/i)?.[1];
  const nearbyPassenger = clean.match(/\n([^\n]{3,100})\n[^\n]{1,30}\n(?:segunda|ter[çc]a|quarta|quinta|sexta|s[aá]bado|domingo)[^\n]*\d{1,2}\/\d{1,2}\/\d{2,4}/i)?.[1];
  const fullName = (labeledPassenger || nearbyPassenger || "Passageiro").trim();
  const [firstName, ...surnameParts] = fullName.split(/\s+/);
  const locator = clean.match(/Reserva\s*:?\s*([A-Z0-9]{5,8})/i)?.[1] || "";
  const seat = clean.match(/Assento\s*\n?\s*([A-Z0-9-]+)/i)?.[1] || "";
  const airline = clean.match(/Operado por\s+([^\n]+)/i)?.[1]?.trim() || "";
  const airlineCode = /azul/i.test(airline) ? "AD" : /latam/i.test(airline) ? "LA" : /\bgol\b/i.test(airline) ? "G3" : "";
  const carryOnBags = /bagagem de m[aã]o/i.test(clean) ? 1 : 0;
  const carryOnWeight = Number(clean.match(/bagagem de m[aã]o[\s\S]{0,100}?(\d+)\s*kg/i)?.[1] || 0);
  const flight = pdfFlight("IDA", travelDate, route[3], `${route[1]} - ${route[2].trim()}`, route[7], `${route[5]} - ${route[6].replace(new RegExp(`\\s*\\(${route[5]}\\)`, "i"), "").trim()}`, 1);
  flight.code = [airlineCode, route[4].trim()].filter(Boolean).join(" ");
  flight.airline = airline;
  flight.carryOnBags = carryOnBags;
  flight.carryOnWeight = carryOnWeight;
  flight.checkedBagWeight = 0;
  flight.passengers = [{
    id: crypto.randomUUID(), name: firstName, surname: surnameParts.join(" "),
    ticket: [locator ? `Reserva ${locator}` : "", seat ? `Assento ${seat}` : ""].filter(Boolean).join(" · "),
    checkedBags: 0, carryOnBags, backpacks: 0,
  }];
  return {
    name: `Voo ${route[1]} → ${route[5]}`,
    client: fullName,
    destination: route[6].replace(new RegExp(`\\s*\\(${route[5]}\\)`, "i"), "").trim(),
    route: `${route[1]} → ${route[5]}`,
    startDate: travelDate,
    endDate: travelDate,
    notes: "",
    showValues: false,
    flightOut: flight,
    flightOutSegments: [],
  };
}

function mapPdfText(rawText: string) {
  const clean = rawText.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  const smiles = parseSmilesDocument(clean);
  if (smiles) {
    const passengers = Array.from({ length: smiles.passengerCount }, (_, index) => {
      const [name = "", ...surname] = (smiles.passengers[index] || "").split(/\s+/);
      return { id: crypto.randomUUID(), name, surname: surname.join(" "), ticket: "", checkedBags: 0, carryOnBags: 0, backpacks: 0 };
    });
    const flights = smiles.flights.map((item) => ({
      ...pdfFlight("IDA", item.date, item.departTime, item.from, item.arriveTime, item.to, smiles.passengerCount),
      code: item.code, airline: item.airline, cabinClass: item.cabinClass,
      arrivalDate: item.arrivalDate, passengers: passengers.map((passenger) => ({ ...passenger, id: crypto.randomUUID() })),
      checkedBagWeight: 0, carryOnWeight: 0,
    }));
    const returnIndex = returnFlightIndex(smiles.flights);
    const outbound = returnIndex < 0 ? flights : flights.slice(0, returnIndex);
    const inbound = returnIndex < 0 ? [] : flights.slice(returnIndex);
    const destination = smiles.flights[outbound.length - 1].to.split(" - ").slice(1).join(" - ");
    return {
      name: `Bilhete ${smiles.locator || smiles.flights[0].from.split(" - ")[0]}`,
      client: smiles.passengers[0] || "", destination,
      route: [smiles.flights[0].from, ...smiles.flights.map((flight) => flight.to)].map((place) => place.split(" - ")[0]).join(" → "),
      startDate: smiles.flights[0].date, endDate: smiles.flights.at(-1)?.arrivalDate || "",
      showValues: false,
      flightOut: outbound[0], flightOutSegments: outbound.slice(1),
      flightBack: inbound[0], flightBackSegments: inbound.slice(1),
      issue: { locator: smiles.locator },
    };
  }
  const boardingPass = mapBoardingPassText(clean);
  if (boardingPass) return boardingPass;
  const startMatch = clean.match(/(?:In[ií]cio|Data de ida|Check-in)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const endMatch = clean.match(/(?:T[eé]rmino|Data de volta|Check-out)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const totalMatch = clean.match(/(?:Total|Valor total|Valor do or[çc]amento)\s*:?\s*R?\$?\s*([\d.,]+)/i);
  const quoteNumber = clean.match(/Or[çc]amento\s*-?\s*(?:N[ºo]\s*)?(\d+)/i)?.[1];
  const titleMatch = clean.match(/(?:Or[çc]amento[^\n]*\n+)(?!\*Reservas)([^\n]{3,120})/i);
  const serviceMatch = clean.match(/Pacote de servi[çc]os\s*\n?(?:\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))?\s*\d*\s*Adultos?\s*\n+([^\n]+)\n+([\s\S]*?)(?=\nResumo\b|$)/i);
  const destinationMatch = clean.match(/^(?:Destino|Sua viagem para)\s*:?\s*([^\n]+)/im);
  const clientMatch = clean.match(/^(?:Cliente|Nome do cliente|Passageiro)\s*:?\s*([^\n]+)/im);
  const explicitNotes = clean.match(/(?:Informa[çc][õo]es adicionais|Observa[çc][õo]es)\s*:?\s*([\s\S]*?)(?=\n(?:VOOS?|CARROS?|HOSPEDAGENS?|HOT[EÉ]IS?|SEGURO|PASSEIOS?|SERVI[ÇC]OS?|RESUMO)\b|$)/i)?.[1]?.trim() || "";
  const foundDates = Array.from(clean.matchAll(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g), (match) => parseBrazilianDate(match[1])).filter(Boolean).sort();
  const startDate = parseBrazilianDate(startMatch?.[1] || "") || foundDates[0] || "";
  const endDate = parseBrazilianDate(endMatch?.[1] || "") || foundDates.at(-1) || "";
  const fallbackYear = startDate.slice(0, 4) || String(new Date().getFullYear());
  const address = clean.match(/\n([^\n]{8,160},\s*[^,\n]+\s+BR),?\n/i)?.[1] || "";
  let hotels = Array.from(clean.matchAll(/^(Hotel[^\n]+)\nCheck-in:\s*(\d{1,2}\/\d{1,2}),\s*(\d{2}:\d{2})\s*Check-out:\s*(\d{1,2}\/\d{1,2}),\s*(\d{2}:\d{2})\s*(\d+)\s*noite/gim)).map((match) => ({
    name: match[1].trim(), address, checkin: dateWithYear(match[2], fallbackYear), checkout: dateWithYear(match[4], fallbackYear),
    checkinTime: match[3], checkoutTime: match[5], rooms: 1, guests: number(clean.match(/STANDARD[^\n]*\s+(\d+)\s+Adultos/i)?.[1] ? Number(clean.match(/STANDARD[^\n]*\s+(\d+)\s+Adultos/i)?.[1]) : 0),
    breakfast: /caf[eé].{0,20}(cortesia|incluso)/i.test(clean), refundable: /Cancelamento at[eé]/i.test(clean),
  }));
  if (!hotels.length) hotels = Array.from(clean.matchAll(/(?:Hotel|Hospedagem)\s*:?\s*([^\n]+)[\s\S]{0,260}?Check-?in\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:[^\d]+(\d{2}:\d{2}))?[\s\S]{0,160}?Check-?out\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:[^\d]+(\d{2}:\d{2}))?/gim)).map((match) => ({
    name: match[1].trim(), address, checkin: dateWithYear(match[2], fallbackYear), checkout: dateWithYear(match[4], fallbackYear),
    checkinTime: match[3] || "14:00", checkoutTime: match[5] || "12:00", rooms: Number(clean.match(/(\d+)\s*quartos?/i)?.[1] || 1),
    guests: Number(clean.match(/(\d+)\s*(?:h[oó]spedes|adultos?)/i)?.[1] || 0), breakfast: /caf[eé].{0,30}(cortesia|incluso)/i.test(clean), refundable: /reembols[aá]vel|cancelamento at[eé]/i.test(clean),
  }));
  const monthNumbers: Record<string, string> = { jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06", jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12" };
  let flights = Array.from(clean.matchAll(/^(IDA|VOLTA)[\s\S]{0,120}?(\d{1,2})\s+de\s+([a-zç]+)\.?\s*(\d+)\s+Adultos?\s+(\d{2}:\d{2})\s+([A-Z]{3})\s+Voo direto\s*(\d{2}:\d{2})\s+([A-Z]{3})/gim)).map((match) => {
    const month = monthNumbers[match[3].slice(0, 3).toLocaleLowerCase("pt-BR")] || "01";
    return pdfFlight(match[1], `${fallbackYear}-${month}-${match[2].padStart(2, "0")}`, match[5], match[6], match[7], match[8], Number(match[4]));
  });
  if (!flights.length) flights = Array.from(clean.matchAll(/(?:^|\n)(IDA|VOLTA)[\s\S]{0,180}?(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)[\s\S]{0,100}?(?:(\d+)\s*Adultos?)?[\s\S]{0,100}?(\d{2}:\d{2})\s*([A-Z]{3})[\s\S]{0,100}?(\d{2}:\d{2})\s*([A-Z]{3})/gim)).map((match) => pdfFlight(
    match[1], dateWithYear(match[2], fallbackYear), match[4], match[5], match[6], match[7], Number(match[3] || 1),
  ));
  const outbound = flights.find((flight) => flight.direction === "IDA");
  const returning = flights.find((flight) => flight.direction === "VOLTA");
  const serviceDate = clean.match(/Pacote de servi[çc]os[\s\S]{0,30}?(\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))/i)?.[1] || "";
  const serviceTravelers = Number(clean.match(/Pacote de servi[çc]os[\s\S]{0,40}?\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2})\s*(\d+)\s+Adultos/i)?.[1] || 0);
  const carSection = clean.match(/(?:Aluguel de carro|Loca[çc][aã]o de ve[ií]culo|Carro)\s*([\s\S]*?)(?=\n(?:HOSPEDAGEM|HOTEL|SEGURO|PASSEIO|SERVI[ÇC]O|RESUMO)\b|$)/i)?.[1] || "";
  const pickup = carSection.match(/(?:Retirada|Pick-?up)\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:\s+(\d{2}:\d{2}))?/i);
  const dropoff = carSection.match(/(?:Devolu[çc][aã]o|Drop-?off)\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:\s+(\d{2}:\d{2}))?/i);
  const car = carSection ? {
    pickupDate: dateWithYear(pickup?.[1] || "", fallbackYear), returnDate: dateWithYear(dropoff?.[1] || "", fallbackYear),
    pickupTime: pickup?.[2] || "", returnTime: dropoff?.[2] || "",
    pickupAddress: carSection.match(/Local de retirada\s*:?\s*([^\n]+)/i)?.[1]?.trim() || "",
    returnAddress: carSection.match(/Local de devolu[çc][aã]o\s*:?\s*([^\n]+)/i)?.[1]?.trim() || "",
    models: carSection.match(/(?:Modelo|Categoria|Grupo)\s*:?\s*([^\n]+)/i)?.[1]?.trim() || "",
    passengers: Number(carSection.match(/(\d+)\s*passageiros?/i)?.[1] || 0), doors: Number(carSection.match(/(\d+)\s*portas?/i)?.[1] || 0),
    sameLocation: /mesmo local|mesmo endere[çc]o/i.test(carSection), airConditioning: /ar.?condicionado/i.test(carSection), airbag: /airbag/i.test(carSection),
    abs: /\bABS\b/i.test(carSection), electricWindows: /vidros? el[eé]tricos?/i.test(carSection), electricLocks: /travas? el[eé]tricas?/i.test(carSection),
    powerSteering: /dire[çc][aã]o (el[eé]trica|hidr[aá]ulica)/i.test(carSection), automatic: /autom[aá]tic/i.test(carSection), refundable: /reembols[aá]vel/i.test(carSection),
  } : undefined;
  const insuranceSection = clean.match(/Seguro viagem\s*([\s\S]*?)(?=\n(?:PASSEIO|SERVI[ÇC]O|RESUMO|TOTAL)\b|$)/i)?.[1] || "";
  const insurance = insuranceSection ? {
    provider: insuranceSection.match(/(?:Fornecedor|Seguradora)\s*:?\s*([^\n]+)/i)?.[1]?.trim() || "",
    plan: insuranceSection.match(/(?:Plano|Produto)\s*:?\s*([^\n]+)/i)?.[1]?.trim() || insuranceSection.split("\n").find(Boolean)?.trim() || "",
    description: insuranceSection.trim(), travelers: Number(insuranceSection.match(/(\d+)\s*(?:viajantes|passageiros|adultos?)/i)?.[1] || 0),
    price: parseMoney(insuranceSection.match(/(?:Valor|Total)\s*:?\s*R?\$?\s*([\d.,]+)/i)?.[1] || ""),
  } : undefined;
  return {
    name: quoteNumber ? `Orçamento ${quoteNumber}` : titleMatch?.[1]?.trim() || "Orçamento importado do PDF",
    client: clientMatch?.[1]?.trim() || "",
    destination: destinationMatch?.[1]?.trim() || outbound?.to || "",
    route: [outbound?.from, outbound?.to, returning?.to].filter(Boolean).join(" → "),
    startDate,
    endDate,
    cashPrice: parseMoney(totalMatch?.[1] || ""),
    showValues: Boolean(totalMatch),
    notes: explicitNotes,
    installments: clean.match(/\b(\d{1,2})x\b/i)?.[1] ? `${clean.match(/\b(\d{1,2})x\b/i)?.[1]}x` : "",
    flightOut: outbound,
    flightBack: returning,
    hotel: hotels[0],
    hotelOptions: hotels.slice(1),
    car,
    insurance,
    tours: serviceMatch ? [{ name: serviceMatch[1].trim(), provider: "", date: parseBrazilianDate(serviceDate), description: serviceMatch[2].trim(), observation: "", price: 0, travelers: serviceTravelers, refundable: false }] : [],
  };
}

async function loadHotelTimes(booking: AnyRecord, companyCode: string, target: URL) {
  const hotelBookings = array(booking.bookingPackages).map(record).flatMap((item) => items(item.bookingHotels)).map(record);
  const cache = new Map<string, Promise<AnyRecord | null>>();
  const detailFor = (hotelKey: string) => {
    const cached = cache.get(hotelKey);
    if (cached) return cached;
    const input = encodeURIComponent(JSON.stringify({ "0": { json: { companyCode, hotelKey, clientUrl: target.toString() } } }));
    const request = fetch(`${target.origin}/orcamento-web/api/trpc/main.getHotel?batch=1&input=${input}`, {
      cache: "no-store", signal: AbortSignal.timeout(45000), headers: { "trpc-accept": "application/jsonl", "content-type": "application/json" },
    }).then(async (response) => {
      if (!response.ok) return null;
      for (const line of (await response.text()).split("\n").filter(Boolean)) {
        try {
          const detail = findHotelDetail(JSON.parse(line));
          if (detail) return detail;
        } catch { /* ignora linha de controle */ }
      }
      return null;
    }).catch(() => null);
    cache.set(hotelKey, request);
    return request;
  };
  await Promise.all(hotelBookings.map(async (hotelBooking) => {
    const hotel = record(hotelBooking.hotel);
    const hotelKey = text(hotel.keyDetail);
    if (!hotelKey) return;
    const detail = await detailFor(hotelKey);
    if (detail) Object.assign(hotel, { checkInTime: detail.checkInTime, checkOutTime: detail.checkOutTime });
  }));
}

async function importUrl(rawUrl: string) {
  const target = new URL(rawUrl);
  if (target.protocol !== "https:" || !(target.hostname === "infotravel.com.br" || target.hostname.endsWith(".infotravel.com.br"))) {
    throw new Error("Use um link HTTPS da InfoTravel.");
  }
  const token = target.searchParams.get("token");
  if (!token) throw new Error("Link da InfoTravel sem token.");
  const decoded = Buffer.from(token, "base64").toString("utf8");
  const [companyCode, bookingIdValue] = decoded.split("|").map((part) => part.trim());
  const bookingId = Number(bookingIdValue);
  if (!companyCode || !Number.isInteger(bookingId)) throw new Error("Token da InfoTravel inválido.");
  const input = encodeURIComponent(JSON.stringify({ "0": { json: { companyCode, bookingId, clientUrl: target.toString() } } }));
  const apiUrl = `${target.origin}/orcamento-web/api/trpc/main.getBooking?batch=1&input=${input}`;
  const response = await fetch(apiUrl, { cache: "no-store", signal: AbortSignal.timeout(45000), headers: { "trpc-accept": "application/jsonl", "content-type": "application/json" } });
  if (!response.ok) throw new Error("A InfoTravel não liberou esse orçamento.");
  const body = await response.text();
  let booking: AnyRecord | null = null;
  for (const line of body.split("\n").filter(Boolean)) {
    try { booking = findBooking(JSON.parse(line)); } catch { /* ignora linha de controle */ }
    if (booking) break;
  }
  if (!booking) throw new Error("Não foi possível interpretar esse orçamento.");
  await loadHotelTimes(booking, companyCode, target);
  return mapInfoTravelBooking(booking);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const identity = request.headers.get("x-forwarded-for")?.split(",")[0] || "quote-import";
  if (!allowRequest(`quote-import:${identity}`, 8, 60_000)) return NextResponse.json({ error: "Muitas importações. Aguarde um instante." }, { status: 429 });
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.type !== "application/pdf") return NextResponse.json({ error: "Selecione um arquivo PDF." }, { status: 400 });
      if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "O PDF deve ter no máximo 4 MB." }, { status: 413 });
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await pdfParse(buffer);
      const embeddedUrl = embeddedInfoTravelUrl(buffer, result.text);
      if (embeddedUrl) return NextResponse.json({ data: await importUrl(embeddedUrl), source: "pdf-url" });
      if (!result.text.trim()) return NextResponse.json({ error: "O PDF não contém texto legível." }, { status: 422 });
      return NextResponse.json({ data: mapPdfText(result.text), source: "pdf" });
    }
    const body = await request.json().catch(() => null) as { url?: string } | null;
    if (!body?.url?.trim()) return NextResponse.json({ error: "Informe a URL do orçamento." }, { status: 400 });
    return NextResponse.json({ data: await importUrl(body.url.trim()), source: "url" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao importar orçamento.";
    return NextResponse.json({ error: message }, { status: /InfoTravel|token|link HTTPS/.test(message) ? 422 : 500 });
  }
}
