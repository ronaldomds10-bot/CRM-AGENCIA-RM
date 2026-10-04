import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { flightDurationMinutes } from "./flight-duration";

type Passenger = {
  name: string; surname: string; ticket: string;
  checkedBags: number; carryOnBags: number; backpacks: number;
};
type Flight = {
  code: string; airline: string; cabinClass?: string; from: string; to: string;
  date: string; arrivalDate?: string; departTime: string; arriveTime: string;
  passengers: Passenger[]; checkedBags: number; carryOnBags: number; backpacks: number;
  checkedBagWeight: number; carryOnWeight: number; refundable: boolean;
};
type Emission = {
  client: string; destination: string; startDate: string; endDate: string; qrContent: string;
  flightOut: Flight; flightBack: Flight; flightOutSegments?: Flight[]; flightBackSegments?: Flight[];
  issue: { locator: string; locatorLink: string; ticket: string; showLogo: boolean; provider: string };
};
type Settings = { logoDataUrl: string; companyName: string };

// Measured in PDF points from the supplied emission. It is deliberately not A4.
const PAGE = { width: 476.88, height: 770.88, margin: 18.75, right: 458.25 };
const INK = "#020817", MUTED = "#4b5563", GRAY = "#71717a", BLUE = "#0053e4";
type Weight = "normal" | "medium" | "semibold";
type Icon = keyof typeof ICONS;
const ICONS = {
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />',
  takeoff: '<path d="M2 22h20" /> <path d="M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l.9-.45a2 2 0 0 1 2.09.2l4.02 3a2 2 0 0 0 2.1.2l4.19-2.06a2.41 2.41 0 0 1 1.73-.17L21 7a1.4 1.4 0 0 1 .87 1.99l-.38.76c-.23.46-.6.84-1.07 1.08L7.58 17.2a2 2 0 0 1-1.22.18Z" />',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  tickets: '<path d="M10.5 17h1.227a2 2 0 0 0 1.345-.52L18 12" /> <path d="m12 13.5 3.794.506" /> <path d="m3.173 8.18 11-5a2 2 0 0 1 2.647.993L18.56 8" /> <path d="M6 10V8" /> <path d="M6 14v1" /> <path d="M6 19v2" /> <rect x="2" y="8" width="20" height="13" rx="2" />',
  checked: '<path d="M22 18H6a2 2 0 0 1-2-2V7a2 2 0 0 0-2-2" /> <path d="M17 14V4a2 2 0 0 0-2-2h-1a2 2 0 0 0-2 2v10" /> <rect width="13" height="8" x="8" y="6" rx="1" /> <circle cx="18" cy="20" r="2" /> <circle cx="9" cy="20" r="2" />',
  carry: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v18M8 7v14"/>',
  backpack: '<path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /> <path d="M8 10h8" /> <path d="M8 18h8" /> <path d="M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6" /> <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />',
  scan: '<path d="M17 12v4a1 1 0 0 1-1 1h-4" /> <path d="M17 3h2a2 2 0 0 1 2 2v2" /> <path d="M17 8V7" /> <path d="M21 17v2a2 2 0 0 1-2 2h-2" /> <path d="M3 7V5a2 2 0 0 1 2-2h2" /> <path d="M7 17h.01" /> <path d="M7 21H5a2 2 0 0 1-2-2v-2" /> <rect x="7" y="7" width="5" height="5" rx="1" />',
  watch: '<path d="M12 10v2.2l1.6 1" /> <path d="m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05" /> <path d="m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05" /> <circle cx="12" cy="12" r="6" />',
};

let fontFiles: Promise<string[]> | undefined;
export function loadFonts() {
  if (!fontFiles) fontFiles = Promise.all(["Regular", "Medium", "SemiBold"].map(async (weight) => {
    const response = await fetch(`/fonts/inter/Inter-${weight}.ttf`);
    if (!response.ok) throw new Error("Não foi possível carregar a fonte do PDF. Tente novamente.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(binary);
  })).catch((error) => { fontFiles = undefined; throw error; });
  return fontFiles;
}

async function rasterImage(source: string): Promise<string> {
  if (!source) return "";
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = source; });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } catch { return ""; }
}

const airportCode = (value: string) => value.trim().match(/^[A-Z]{3}\b/i)?.[0].toUpperCase() || "";
const airportName = (value: string) => value.replace(/^[A-Z]{3}\s*[-–—]\s*/i, "").trim() || "A confirmar";
const fullDate = (value: string) => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Data a confirmar" : date.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" });
};
function safeLink(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}

export async function createEmissionPdf(emission: Emission, settings: Settings): Promise<jsPDF> {
  const flights = [
    ...[emission.flightOut, ...(emission.flightOutSegments ?? [])].map((flight) => ({ flight, direction: "ida", fallback: emission.startDate })),
    ...[emission.flightBack, ...(emission.flightBackSegments ?? [])].map((flight) => ({ flight, direction: "volta", fallback: emission.endDate })),
  ].filter(({ flight }) => flight.code || flight.from || flight.to || flight.date);
  const airlineCode = (flight: Flight) => {
    const name = flight.airline.toUpperCase();
    return name.includes("LATAM") ? "LA" : name.includes("AZUL") ? "AD" : name.includes("GOL") ? "G3" : flight.code.trim().slice(0, 2).toUpperCase();
  };
  const codes = [...new Set(flights.map(({ flight }) => airlineCode(flight)).filter(Boolean))];
  const localLogos: Record<string, string> = { LA: "/emission/latam.png", AD: "/airlines/azul.svg", G3: "/airlines/gol.svg" };
  const qrValue = emission.qrContent || emission.issue.locatorLink || emission.issue.locator;
  const [fonts, timeZones, logo, airlineImages, qr] = await Promise.all([
    loadFonts(),
    fetch("/airport-timezones.json").then((r): Promise<Record<string, string>> | Record<string, string> => r.ok ? r.json() : {}).catch(() => ({} as Record<string, string>)),
    emission.issue.showLogo ? rasterImage(settings.logoDataUrl || "/emission/rm-partiu.png") : Promise.resolve(""),
    Promise.all(codes.map(async (code) => [code, await rasterImage(localLogos[code] || `/api/airlines/logo?code=${encodeURIComponent(code)}`)] as const)),
    qrValue ? QRCode.toDataURL(qrValue, { margin: 0, width: 328, errorCorrectionLevel: "M" }) : Promise.resolve(""),
  ]);
  const logos = new Map(airlineImages);
  const iconImages = new Map<string, string>();
  await Promise.all(Object.entries(ICONS).flatMap(([name, paths]) => [INK, BLUE, "#64748b", MUTED].map(async (color) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
    iconImages.set(`${name}:${color}`, await rasterImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`));
  })));
  const pdf = new jsPDF({ unit: "pt", format: [PAGE.width, PAGE.height], compress: true, putOnlyUsedFonts: true });
  pdf.setProperties({ title: `Emissão ${emission.issue.locator || emission.client}`, author: settings.companyName || "RM Partiu Viagens" });
  (["normal", "medium", "semibold"] as const).forEach((weight, index) => {
    pdf.addFileToVFS(`Inter-${weight}.ttf`, fonts[index]);
    pdf.addFont(`Inter-${weight}.ttf`, "Inter", weight);
  });
  const text = (value: string, x: number, y: number, size: number, color = INK, weight: Weight = "normal", align: "left" | "center" | "right" = "left", maxWidth?: number) => {
    pdf.setFont("Inter", weight); pdf.setFontSize(size); pdf.setTextColor(color);
    // Keep unusually long values in their own column without clipping other fields.
    if (maxWidth && pdf.getTextWidth(value) > maxWidth) pdf.setFontSize(Math.max(4, size * maxWidth / pdf.getTextWidth(value)));
    pdf.text(value, x, y, { align });
  };
  const icon = (name: Icon, x: number, y: number, size: number, color = INK) => {
    const image = iconImages.get(`${name}:${color}`);
    if (image) pdf.addImage(image, "PNG", x, y, size, size);
  };
  const line = (x: number, y: number, x2: number, y2: number, color: string, width = 0.75) => {
    pdf.setDrawColor(color); pdf.setLineWidth(width); pdf.line(x, y, x2, y2);
  };
  const image = (data: string, x: number, y: number, width: number, height: number) => {
    if (!data) return;
    const props = pdf.getImageProperties(data), ratio = Math.min(width / props.width, height / props.height);
    const w = props.width * ratio, h = props.height * ratio;
    pdf.addImage(data, "PNG", x + (width - w) / 2, y + (height - h) / 2, w, h);
  };
  const header = () => {
    if (logo) {
      pdf.saveGraphicsState();
      pdf.roundedRect(18.75, 28.5, 60, 60, 10.5, 10.5, null); pdf.clip(); pdf.discardPath();
      image(logo, 18.75, 28.5, 60, 60); pdf.restoreGraphicsState();
    }
    text("Seu localizador é", 392.25, 48.75, 6, INK, "normal", "right");
    const locators = emission.issue.locator.split(/[|,;/]+/).map((part) => part.trim()).filter(Boolean);
    const label = locators.map((part, index) => {
      if (/^[A-Z0-9]{2}\s*:/i.test(part)) return part;
      const flight = index === 0 ? emission.flightOut : emission.flightBack;
      const prefix = airlineCode(flight) || airlineCode(emission.flightOut);
      return prefix ? `${prefix}: ${part}` : part;
    }).join(" | ") || "Não informado";
    text(label, 392.25, 63, 10.5, INK, "semibold", "right", 295);
    if (qr) {
      text("Clique ou escaneie o QR Code", 392.25, 72, 5.25, MUTED, "normal", "right");
      pdf.addImage(qr, "PNG", 407.25, 40.5, 36, 36);
      const link = safeLink(qrValue);
      if (link) { pdf.link(407.25, 40.5, 36, 36, { url: link }); pdf.link(310, 65, 82.25, 10, { url: link }); }
    }
  };
  header();
  const layouts = flights.map(({ flight }) => {
    const fallbackPassenger = { name: emission.client.trim().split(/\s+/)[0] || "Passageiro", surname: emission.client.trim().split(/\s+/).slice(1).join(" "), ticket: emission.issue.ticket, checkedBags: flight.checkedBags, carryOnBags: flight.carryOnBags, backpacks: flight.backpacks };
    const passengers = flight.passengers.length ? flight.passengers.map((passenger) => passenger.name.trim() || passenger.surname.trim() ? passenger : { ...passenger, name: fallbackPassenger.name, surname: fallbackPassenger.surname }) : [fallbackPassenger];
    const rowHeights: number[] = [];
    for (let index = 0; index < passengers.length; index += 3) {
      rowHeights.push(Math.max(...passengers.slice(index, index + 3).map((p) => {
        pdf.setFont("Inter", "semibold"); pdf.setFontSize(9);
        const surnameLines = (pdf.splitTextToSize(p.surname || "", 127.5) as string[]).length;
        pdf.setFont("Inter", "normal"); pdf.setFontSize(7.5);
        const nameLines = (pdf.splitTextToSize(p.name || "Passageiro", 127.5) as string[]).length;
        return 95.25 + Math.max(0, surnameLines - 1) * 11.25 + Math.max(0, nameLines - 1) * 10;
      })));
    }
    return { passengers, rowHeights };
  });
  const keepRoundTripTogether = flights.length === 2 && flights[0].direction === "ida" && flights[1].direction === "volta";
  if (keepRoundTripTogether) {
    // Preserve the reference at 100% when it fits; fit longer bookings as one
    // proportional group below the unchanged logo, locators and clickable QR.
    const contentEnd = 120 + layouts.reduce((height, { rowHeights }, index) =>
      height + (index ? 162.75 : 163.5) + rowHeights.reduce((a, b) => a + b, 0)
      + (rowHeights.length - 1) * 7.5 + 15.75 + 51, 0) - 51 + 6;
    const scale = Math.min(1, (735 - 110) / (contentEnd - 110));
    pdf.saveGraphicsState();
    pdf.setCurrentTransformationMatrix(pdf.Matrix(scale, 0, 0, scale,
      PAGE.width * (1 - scale) / 2, (PAGE.height - 110) * (1 - scale)));
  }
  let y = 120;
  const nextPage = () => { pdf.addPage([PAGE.width, PAGE.height]); header(); y = 120; };
  const bottom = 735;
  const zone = (airport: string, date: string) => {
    const timeZone = timeZones[airportCode(airport)];
    if (!timeZone || !date) return "";
    try { return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date(`${date}T12:00:00Z`)).find((part) => part.type === "timeZoneName")?.value || ""; }
    catch { return ""; }
  };
  const schedule = (flight: Flight, date: string) => {
    const minutes = flightDurationMinutes({ departureDate: date, departureTime: flight.departTime, departureTimeZone: timeZones[airportCode(flight.from)] || "", arrivalDate: flight.arrivalDate, arrivalTime: flight.arriveTime, arrivalTimeZone: timeZones[airportCode(flight.to)] || "" });
    let arrival = flight.arrivalDate || date;
    // Infer an overnight arrival using elapsed time AND airport offsets, not the clock alone.
    if (!flight.arrivalDate && minutes !== null) {
      const offset = (label: string) => { const m = label.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/); return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0; };
      const [h, m] = flight.departTime.split(":").map(Number);
      const days = Math.floor((h * 60 + m + minutes + offset(zone(flight.to, date)) - offset(zone(flight.from, date))) / 1440);
      const instant = new Date(`${date}T12:00:00Z`); instant.setUTCDate(instant.getUTCDate() + days); arrival = instant.toISOString().slice(0, 10);
    }
    return { arrival, duration: minutes === null ? "A confirmar" : `${Math.floor(minutes / 60)}h ${minutes % 60}min` };
  };
  const drawPassenger = (passenger: Passenger, x: number, top: number, height: number) => {
    pdf.setFillColor("#f5f5ff"); pdf.roundedRect(x, top, 142.5, height, 9, 9, "F");
    icon("tickets", x + 7.5, top + 9, 16.5);
    pdf.setFillColor("#e5e5ff"); pdf.roundedRect(x + 54, top + 7.5, 81, 19.5, 9, 9, "F");
    const counts = [passenger.checkedBags, passenger.carryOnBags, passenger.backpacks];
    const names: Icon[] = ["checked", "carry", "backpack"];
    counts.forEach((count, index) => {
      const color = count ? BLUE : "#64748b", dx = [60, 87, 111.75][index];
      icon(names[index], x + dx, top + 12, 9, color);
      text(String(count || 0), x + dx + 13.5, top + 20.25, 9, color, "semibold");
    });
    pdf.setFont("Inter", "semibold"); pdf.setFontSize(9);
    const surname = pdf.splitTextToSize(passenger.surname || "", 127.5) as string[];
    surname.forEach((part, i) => text(part, x + 7.5, top + 42 + i * 11.25, 9, INK, "semibold"));
    const nameY = top + 53.25 + Math.max(0, surname.length - 1) * 11.25;
    pdf.setFont("Inter", "normal"); pdf.setFontSize(7.5);
    const firstName = pdf.splitTextToSize(passenger.name || "Passageiro", 127.5) as string[];
    firstName.forEach((part, i) => text(part, x + 7.5, nameY + i * 10, 7.5));
    icon("scan", x + 7.5, top + height - 30.75, 9);
    text("eTicket", x + 19.5, top + height - 26.25, 5.25, INK, "medium");
    text(passenger.ticket || emission.issue.ticket || "Não informado", x + 7.5, top + height - 10.5, 9, INK, "normal", "left", 127.5);
  };
  for (let flightIndex = 0; flightIndex < flights.length; flightIndex++) {
    const { flight, direction, fallback } = flights[flightIndex], date = flight.date || fallback;
    const timing = schedule(flight, date);
    const { passengers, rowHeights } = layouts[flightIndex];
    const totalHeight = 179.25 + rowHeights.reduce((a, b) => a + b, 0) + (rowHeights.length - 1) * 7.5;
    const previous = flights[flightIndex - 1];
    let connection = "";
    if (previous?.direction === direction) {
      const previousArrival = schedule(previous.flight, previous.flight.date || previous.fallback).arrival;
      const minutes = (Date.parse(`${date}T${flight.departTime}:00Z`) - Date.parse(`${previousArrival}T${previous.flight.arriveTime}:00Z`)) / 60000;
      connection = Number.isFinite(minutes) && minutes >= 0 ? `Parada de ${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}min` : "Tempo de parada a confirmar";
    }
    const newPage = !keepRoundTripTogether && y + Math.min(totalHeight, 179.25 + rowHeights[0]) > bottom;
    if (newPage) nextPage();
    else if (flightIndex && !connection) line(PAGE.margin, y - 24.75, PAGE.right, y - 24.75, "#e2e8f0");
    if (connection) text(connection, PAGE.width / 2, y - 20, 6, MUTED, "medium", "center");
    const city = airportName(flight.to || emission.destination).split(/[,/]/)[0];
    icon("plane", PAGE.margin, y - 6, 18);
    text(`Sua viagem de ${direction} para ${city}`, 42.75, y, 9.75, INK, "semibold", "left", 385);
    text(`em ${fullDate(date)}`, 42.75, y + 11.25, 6.75, GRAY);
    icon("users", 439.5, y - 3, 12);
    text(String(passengers.length), PAGE.right, y + 5.25, 8.25, INK, "medium", "right");
    const top = y + 22.5;
    pdf.setDrawColor("#dadada"); pdf.setLineWidth(0.75); pdf.setFillColor("#ffffff");
    pdf.roundedRect(PAGE.margin, top, 439.5, 90.75, 10.5, 10.5, "FD");
    const airlineLogo = logos.get(airlineCode(flight));
    if (airlineLogo) image(airlineLogo, 33.75, top + 21, 90, 33.75);
    else text(flight.airline || emission.issue.provider || "Companhia aérea", 79.5, top + 45, 9, INK, "semibold", "center", 100);
    text(flight.code || "Voo a confirmar", 79.5, top + 66, 7.5, INK, "semibold", "center", 100);
    text("Classe", 166.5, top + 42.75, 5.25, MUTED, "medium", "center");
    text(flight.cabinClass || "Econômica", 166.5, top + 51, 9, MUTED, "semibold", "center", 73);
    line(208.5, top + 15, 208.5, top + 75, "#d9d9d9");
    const airport = (value: string, time: string, day: string, right: boolean) => {
      const x = right ? 442.5 : 221.25, align = right ? "right" : "left";
      text(time || "--:--", x, top + 24, 9, INK, "semibold", align);
      text(fullDate(day).replace(/ de \d{4}$/, ""), x, top + 33.75, 6, GRAY, "normal", align);
      const code = airportCode(value) || "---";
      pdf.setFont("Inter", "semibold"); pdf.setFontSize(6.75);
      icon("plane", right ? x - pdf.getTextWidth(code) - 15 : x, top + 42.75, 12);
      text(code, right ? x : x + 15, top + 50.25, 6.75, INK, "semibold", align);
      text(airportName(value), x, top + 66.75, 6.75, MUTED, "normal", align, 91);
      const gmt = zone(value, day);
      if (gmt) {
        pdf.setFont("Inter", "normal"); pdf.setFontSize(5.25);
        icon("watch", right ? x - pdf.getTextWidth(gmt) - 7.5 : x, top + 68.25, 6, MUTED);
        text(gmt, right ? x : x + 7.5, top + 72.75, 5.25, MUTED, "normal", align);
      }
    };
    airport(flight.from, flight.departTime, date, false);
    airport(flight.to, flight.arriveTime, timing.arrival, true);
    icon("takeoff", 325.5, top + 36.75, 12);
    text(timing.duration, 331.875, top + 53.25, 6, INK, "normal", "center", 66);
    text(`Esta reserva ${flight.refundable ? "é" : "não é"} reembolsável`, PAGE.margin, y + 126, 5.25, MUTED);
    const passengerOffset = flightIndex ? 162.75 : 163.5;
    text("Passageiros", PAGE.margin, y + passengerOffset - 10.5, 9, GRAY, "semibold");
    y += passengerOffset;
    rowHeights.forEach((height, row) => {
      if (!keepRoundTripTogether && y + height + 16 > bottom) { nextPage(); text("Passageiros (continuação)", PAGE.margin, y, 9, GRAY, "semibold"); y += 10.5; }
      passengers.slice(row * 3, row * 3 + 3).forEach((passenger, column) => drawPassenger(passenger, PAGE.margin + column * 148.5, y, height));
      y += height + (row < rowHeights.length - 1 ? 7.5 : 0);
    });
    if (!keepRoundTripTogether && y + 21 > bottom) { nextPage(); }
    const legendY = y + 15.75;
    const legends: [Icon, string, number, number][] = [
      ["checked", `Bagagens despachadas (${flight.checkedBagWeight ?? 23}kg)`, 32.25, 48.125],
      ["carry", `Bagagens de bordo (${flight.carryOnWeight ?? 10}kg)`, 188.25, 204.75],
      ["backpack", "Mochila ou bolsa", 353.25, 368.72],
    ];
    legends.forEach(([name, label, x, tx]) => { icon(name, x, legendY - 8.25, 12, BLUE); text(label, tx, legendY, 6.75); });
    y = legendY + 51;
  }
  if (keepRoundTripTogether) pdf.restoreGraphicsState();
  return pdf;
}
