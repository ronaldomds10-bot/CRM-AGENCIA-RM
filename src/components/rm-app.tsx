"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

type ViewKey =
  | "dashboard"
  | "quotes"
  | "issues"
  | "clients"
  | "finance"
  | "calendar"
  | "suppliers"
  | "tutorials"
  | "billing"
  | "settings";
type QuoteTab = "trip" | "flights" | "cars" | "hotels" | "insurance";
type Status = "cotacao" | "aguardando" | "emitido" | "cancelado";
type Airport = { i: string; c: string; n: string; p: string };
type Passenger = { id: string; name: string; surname: string; ticket: string; checkedBags: number; carryOnBags: number; backpacks: number };

let airportCache: Airport[] | null = null;

type Flight = {
  segmentId?: string;
  code: string;
  airline: string;
  cabinClass?: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
  date: string;
  adults: number;
  children: number;
  bags: number;
  passengers: Passenger[];
  checkedBags: number;
  carryOnBags: number;
  backpacks: number;
  checkedBagWeight: number;
  carryOnWeight: number;
  pets: number;
  refundable: boolean;
};
type CarReservation = {
  pickupDate: string;
  returnDate: string;
  pickupTime: string;
  returnTime: string;
  pickupAddress: string;
  returnAddress: string;
  models: string;
  passengers: number;
  doors: number;
  sameLocation: boolean;
  airConditioning: boolean;
  airbag: boolean;
  abs: boolean;
  electricWindows: boolean;
  electricLocks: boolean;
  powerSteering: boolean;
  automatic: boolean;
  refundable: boolean;
};
type HotelReservation = {
  name: string;
  address: string;
  checkin: string;
  checkout: string;
  checkinTime: string;
  checkoutTime: string;
  rooms: number;
  guests: number;
  breakfast: boolean;
  refundable: boolean;
};
type InsuranceReservation = {
  description?: string;
  provider: string;
  plan: string;
  travelers: number;
  price: number;
};
type IssueDetails = {
  locator: string;
  locatorLink: string;
  saleDate: string;
  method: "money" | "consolidator" | "miles" | "concierge";
  provider: string;
  milesSupplier: string;
  pointsAmount: number;
  thousandCost: number;
  fees: number;
  ticket: string;
  paymentStatus: "pending" | "paid";
  paidAt: string;
  dueDate: string;
  paymentMethod: string;
  showLogo: boolean;
  extraNotes: string;
};
type Quote = {
  id: string;
  createdAt: string;
  isIssue?: boolean;
  isDemo?: boolean;
  name: string;
  client: string;
  destination: string;
  route: string;
  startDate: string;
  endDate: string;
  status: Status;
  cashPrice: number;
  cost: number;
  notes: string;
  showValues: boolean;
  installments: string;
  paymentOption: string;
  qrCode: boolean;
  qrContent: string;
  qrCaption: string;
  issueType: "flight" | "car" | "hotel";
  issue: IssueDetails;
  flightOut: Flight;
  flightBack: Flight;
  flightOutSegments?: Flight[];
  flightBackSegments?: Flight[];
  car: CarReservation;
  hotel: HotelReservation;
  insurance: InsuranceReservation;
  carOptions?: CarReservation[];
  hotelOptions?: HotelReservation[];
  insuranceOptions?: InsuranceReservation[];
};
type Client = {
  id: string;
  name: string;
  phone: string;
  email: string;
  birthday: string;
  document: string;
  passport: string;
  origin: string;
  surname?: string;
  address?: string;
  hasPassport?: boolean;
  passportIssuedAt?: string;
  passportExpiresAt?: string;
  passportCountry?: string;
  createdAt?: string;
};
type Supplier = {
  id: string;
  name: string;
  type: string;
  contact: string;
  notes: string;
  phone?: string;
  document?: string;
  counter?: string;
  createdAt?: string;
};
type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  description: string;
  completed?: boolean;
};
type AppSettings = {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  companyName: string;
  document: string;
  instagram: string;
  address: string;
  logoDataUrl: string;
  currency: "BRL" | "USD" | "EUR";
  installmentRates: number[];
};
type CRMData = {
  quotes: Quote[];
  clients: Client[];
  suppliers: Supplier[];
  events: CalendarEvent[];
  settings: AppSettings;
};
type SharedQuote = { quote: Quote; settings: AppSettings };

const STORAGE_KEY = "rm-travel-hub-local-v1";
const LEGACY_STORAGE_KEY = `rm-partiu-${"air" + "pass"}-inspired-local-v1`;
const nav: Array<{ key: ViewKey; label: string; icon: string }> = [
  { key: "dashboard", label: "Dashboard", icon: "⌂" },
  { key: "quotes", label: "Orçamentos", icon: "▣" },
  { key: "issues", label: "Emissões", icon: "▤" },
  { key: "clients", label: "Clientes", icon: "◎" },
  { key: "finance", label: "Financeiro", icon: "$" },
  { key: "calendar", label: "Calendário", icon: "□" },
  { key: "suppliers", label: "Fornecedores", icon: "◇" },
  { key: "tutorials", label: "Tutoriais", icon: "▷" },
];
const statusText: Record<Status, string> = {
  cotacao: "Cotação",
  aguardando: "Aguardando",
  emitido: "Emitido",
  cancelado: "Cancelado",
};

const loyaltyPrograms = [
  "Livelo",
  "Smiles",
  "LATAM Pass",
  "Azul Fidelidade",
  "TAP Miles&Go",
  "Avios Iberia",
  "Avios British",
  "Avios Qatar",
  "Avios Finnair",
  "AA",
  "Flying Blue",
  "United MileagePlus",
  "Air Canada Aeroplan",
  "Miles & More",
  "Delta SkyMiles",
  "Alaska Mileage Plan",
  "Copa ConnectMiles",
  "Emirates Skywards",
  "Singapore Airlines KrisFlyer",
  "Turkish Airlines Miles&Smiles",
];

const importedClients: Client[] = [
  { id: "import-aline-xavier-vieira", name: "ALINE", surname: "XAVIER VIEIRA", document: "44277543847", email: "xavalinne@gmail.com", phone: "5511996064505", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-cacia-nascimento-souza-vilar", name: "CÁCIA", surname: "Nascimento Souza Vilar", document: "18309756844", email: "teste@gmail.com", phone: "5511962807600", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-evelyn-balmont-dos-reis", name: "EVELYN", surname: "BALMONT DOS REIS", document: "49295228898", email: "evelynbalmont@icloud.com", phone: "5511988861377", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-gilberto-dias-oliveira", name: "GILBERTO", surname: "DIAS OLIVEIRA", document: "34126986871", email: "bettodoliveira23@gmail.com", phone: "5511983392963", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-jefferson-gabriel-maciel-da-silva", name: "JEFFERSON", surname: "GABRIEL MACIEL DA SILVA", document: "56586975816", email: "gabrielmacielbiel1@gmail.com", phone: "5511959279570", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-jhuly-mabel-orellana-siles", name: "JHULY", surname: "MABEL ORELLANA SILES", document: "23496152869", email: "mabelsantos292@gmail.com", phone: "5511958322866", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-julia-rodrigues-de-souza", name: "JULIA", surname: "RODRIGUES DE SOUZA", document: "54973423882", email: "rodriguesjuliasouza13@gmail.com", phone: "5511996738341", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-jefferson-leite-de-melo", name: "Jefferson", surname: "Leite de Melo", document: "", email: "", phone: "5511948623869", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-kemilly-dos-santos-cardozo", name: "Kemilly", surname: "dos Santos Cardozo", document: "36888083802", email: "kemillysat2@gmail.com", phone: "55119533407088", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-maria-de-sousa-bernardes", name: "MARIA", surname: "DE SOUSA BERNARDES", document: "49835283850", email: "", phone: "5513981529077", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-mario-loureiro-carriel", name: "MARIO", surname: "LOUREIRO CARRIEL", document: "46416216833", email: "mariogabrielcarriel@gmail.com", phone: "5511962566710", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-noemia-esteves-xavier-de-almeida", name: "Noemia", surname: "Esteves Xavier De Almeida", document: "14205158882", email: "", phone: "5511915763264", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-pedro-agustin-carrasco-rojas", name: "PEDRO", surname: "AGUSTIN CARRASCO ROJAS", document: "12886081876", email: "", phone: "550000000", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-phamela-aparecida-monteiro-da-veiga", name: "Phamela", surname: "Aparecida Monteiro da Veiga", document: "38363161888", email: "phanzinha89@gmail.com", phone: "5515997353806", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-rafael-luis-de-paula-ferreira", name: "Rafael", surname: "LUÍS de Paula Ferreira", document: "11240069740", email: "", phone: "5521995237562", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-ronald-caetano-dos-santos", name: "Ronald", surname: "Caetano dos Santos", document: "38529161866", email: "ronaldcaetano1990@gmail.com", phone: "5511978376824", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-samuel-serrate-ayala", name: "SAMUEL", surname: "SERRATE AYALA", document: "1647258812", email: "", phone: "5511978808307", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-taciana-melo-de-araujo", name: "TACIANA", surname: "MELO DE ARAUJO", document: "43510490819", email: "ronaldomds10@gmail.com", phone: "5511966032098", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-valdeci-dos-santos-souza", name: "VALDECI", surname: "DOS SANTOS SOUZA", document: "62603850563", email: "123@hotmail.com", phone: "5511978600754", birthday: "", passport: "", origin: "Importação de planilha" },
  { id: "import-warley-tiago-goncalves-fernandes", name: "WARLEY", surname: "TIAGO GONÇALVES FERNANDES", document: "12359712608", email: "", phone: "550000000", birthday: "", passport: "", origin: "Importação de planilha" },
].map((client) => ({ ...client, createdAt: "2026-09-07T00:00:00.000Z" }));

function mergeImportedClients(clients: Client[]) {
  const normalized = (value?: string) => value?.trim().toLocaleLowerCase("pt-BR") || "";
  const seenIds = new Set<string>();
  const uniqueClients = clients.filter((client) => {
    if (seenIds.has(client.id)) return false;
    seenIds.add(client.id);
    return true;
  });
  const existingKeys = new Set(
    uniqueClients.flatMap((client) => [
      client.document ? `document:${normalized(client.document)}` : "",
      client.email ? `email:${normalized(client.email)}` : "",
      `name:${normalized(`${client.name} ${client.surname || ""}`)}`,
    ]).filter(Boolean),
  );
  const missing = importedClients.filter((client) => {
    const keys = [
      client.document ? `document:${normalized(client.document)}` : "",
      client.email ? `email:${normalized(client.email)}` : "",
      `name:${normalized(`${client.name} ${client.surname || ""}`)}`,
    ].filter(Boolean);
    return !keys.some((key) => existingKeys.has(key));
  });
  return [...missing, ...uniqueClients];
}

function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `local-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function todayIso(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
function defaultPassenger(): Passenger {
  return {
    id: uid(),
    name: "",
    surname: "",
    ticket: "",
    checkedBags: 0,
    carryOnBags: 1,
    backpacks: 1,
  };
}
function defaultFlight(partial: Partial<Flight> = {}): Flight {
  return {
    code: "AD4191",
    airline: "Azul",
    from: "GRU - São Paulo/SP",
    to: "FOR - Fortaleza/CE",
    departTime: "08:45",
    arriveTime: "12:10",
    date: todayIso(12),
    adults: 1,
    children: 0,
    bags: 1,
    passengers: [defaultPassenger()],
    checkedBags: 0,
    carryOnBags: 1,
    backpacks: 1,
    checkedBagWeight: 23,
    carryOnWeight: 10,
    pets: 0,
    refundable: false,
    ...partial,
  };
}
function emptyFlight(): Flight {
  return {
    ...defaultFlight(),
    code: "",
    airline: "",
    from: "",
    to: "",
    departTime: "",
    arriveTime: "",
    date: "",
    adults: 0,
    children: 0,
    bags: 0,
    passengers: [defaultPassenger()],
    checkedBags: 0,
    carryOnBags: 0,
    backpacks: 0,
    checkedBagWeight: 0,
    carryOnWeight: 0,
    pets: 0,
    refundable: false,
  };
}
function normalizeFlight(flight: Flight): Flight {
  const passengers = flight.passengers.map((passenger, index) => ({
    ...passenger,
    checkedBags: passenger.checkedBags ?? (index === 0 ? flight.checkedBags : 0),
    carryOnBags: passenger.carryOnBags ?? (index === 0 ? flight.carryOnBags : 0),
    backpacks: passenger.backpacks ?? (index === 0 ? flight.backpacks : 0),
  }));
  return syncPassengerBaggage({ ...flight, passengers });
}
function airportRouteLabel(value: string) {
  const trimmed = value.trim();
  const iata = trimmed.match(/^([A-Z0-9]{3})(?:\s|\s*-)/i)?.[1];
  return (iata || trimmed).toUpperCase();
}
function flightRoute(flightOut: Flight, flightBack: Flight, fallback = "") {
  const stops = [flightOut.from, flightOut.to, flightBack.from, flightBack.to]
    .map(airportRouteLabel)
    .filter(Boolean)
    .filter((stop, index, all) => index === 0 || stop !== all[index - 1]);
  return stops.length >= 2 ? stops.join(" → ") : fallback;
}
function installmentCalculation(cashPrice: number, installmentOption: string) {
  const parts = installmentOption.match(/^(\d+)x\s*-\s*([\d,.]+)%$/i);
  if (!parts || cashPrice <= 0) return null;
  const installments = Number(parts[1]);
  const rate = Number(parts[2].replace(".", "").replace(",", "."));
  const total = cashPrice * (1 + rate / 100);
  return { installments, rate, total, installmentValue: total / installments };
}
function installmentPrice(cashPrice: number, installmentOption: string) {
  const calculation = installmentCalculation(cashPrice, installmentOption);
  return calculation ? money(calculation.total) : "";
}
function issueCost(quote: Quote) {
  if (quote.issue.method !== "miles") return Number(quote.cost) || 0;
  const points = Number(quote.issue.pointsAmount) || 0;
  const thousandCost = Number(quote.issue.thousandCost) || 0;
  const fees = Number(quote.issue.fees) || 0;
  return (points / 1000) * thousandCost + fees;
}
function issueDefaultName(issue: Quote) {
  const client = issue.client.trim();
  const origin = airportRouteLabel(issue.flightOut.from);
  const destination = airportRouteLabel(issue.flightOut.to || issue.destination);
  const route = [origin, destination].filter(Boolean).join(" → ");
  return [client, route].filter(Boolean).join(" - ");
}
function syncPassengerBaggage(flight: Flight): Flight {
  return {
    ...flight,
    checkedBags: flight.passengers.reduce((sum, passenger) => sum + passenger.checkedBags, 0),
    carryOnBags: flight.passengers.reduce((sum, passenger) => sum + passenger.carryOnBags, 0),
    backpacks: flight.passengers.reduce((sum, passenger) => sum + passenger.backpacks, 0),
  };
}
function defaultQuote(): Quote {
  return {
    id: uid(),
    createdAt: todayIso(),
    name: "Novo orçamento",
    client: "Cliente Exemplo",
    destination: "FORTALEZA - CE",
    route: "VCP → BEL → VCP",
    startDate: todayIso(12),
    endDate: todayIso(22),
    status: "cotacao",
    cashPrice: 4624,
    cost: 3830,
    showValues: false,
    installments: "6x - 9,67%",
    paymentOption: "PIX ou entrada + parcelamento",
    qrCode: false,
    qrContent: "",
    qrCaption: "Aponte a câmera para acessar",
    issueType: "flight",
    issue: {
      locator: "",
      locatorLink: "",
      saleDate: todayIso(),
      method: "consolidator",
      provider: "",
      milesSupplier: "",
      pointsAmount: 0,
      thousandCost: 0,
      fees: 0,
      ticket: "",
      paymentStatus: "pending",
      paidAt: "",
      dueDate: todayIso(7),
      paymentMethod: "PIX",
      showLogo: true,
      extraNotes: "",
    },
    notes: "Opção 1 - PIX R$ 4.800,00\nOpção 2 - Entrada + parcelamento.",
    flightOut: defaultFlight(),
    flightOutSegments: [],
    flightBack: defaultFlight({
      from: "FOR - Fortaleza/CE",
      to: "GRU - São Paulo/SP",
      departTime: "12:50",
      arriveTime: "16:20",
      date: todayIso(22),
    }),
    flightBackSegments: [],
    car: {
      pickupDate: todayIso(12),
      returnDate: todayIso(22),
      pickupTime: "10:00",
      returnTime: "18:00",
      pickupAddress: "Aeroporto de Fortaleza",
      returnAddress: "Mesmo endereço",
      models: "Econômico, SUV compacto",
      passengers: 4,
      doors: 4,
      sameLocation: true,
      airConditioning: true,
      airbag: true,
      abs: true,
      electricWindows: true,
      electricLocks: true,
      powerSteering: true,
      automatic: false,
      refundable: false,
    },
    hotel: {
      name: "Hotel Beira Mar",
      address: "Fortaleza - CE",
      checkin: todayIso(12),
      checkout: todayIso(22),
      checkinTime: "14:00",
      checkoutTime: "12:00",
      rooms: 1,
      guests: 2,
      breakfast: true,
      refundable: false,
    },
    insurance: {
      provider: "Assist Card",
      plan: "Brasil Essencial",
      travelers: 2,
      price: 180,
    },
  };
}
function blankQuote(): Quote {
  const quote = defaultQuote();
  return {
    ...quote,
    isIssue: false,
    name: "", client: "", destination: "", route: "",
    startDate: "", endDate: "", cashPrice: 0, cost: 0,
    installments: "", paymentOption: "", notes: "",
    qrContent: "", qrCaption: "",
    flightOut: emptyFlight(),
    flightBack: emptyFlight(),
    car: {
      ...quote.car, pickupDate: "", returnDate: "", pickupTime: "",
      returnTime: "", pickupAddress: "", returnAddress: "", models: "",
      passengers: 0, doors: 0, sameLocation: false, airConditioning: false,
      airbag: false, abs: false, electricWindows: false, electricLocks: false,
      powerSteering: false,
    },
    hotel: {
      ...quote.hotel, name: "", address: "", checkin: "", checkout: "",
      checkinTime: "", checkoutTime: "", rooms: 0, guests: 0,
      breakfast: false,
    },
    insurance: { provider: "", plan: "", travelers: 0, price: 0 },
    issue: {
      ...quote.issue, locator: "", locatorLink: "", provider: "", milesSupplier: "", pointsAmount: 0, thousandCost: 0, fees: 0, ticket: "",
      saleDate: "", paidAt: "", dueDate: "", extraNotes: "",
    },
  };
}

const requestedSuppliers: Supplier[] = [
  {
    id: "supplier-ronaldo-macena",
    name: "Ronaldo Macena",
    type: "Não definido",
    contact: "(11) 98756-9836",
    phone: "(11) 98756-9836",
    document: "456.347.868-78",
    counter: "",
    notes: "",
  },
  {
    id: "supplier-emily-macena",
    name: "EMILY MACENA",
    type: "Não definido",
    contact: "(11) 98252-6815",
    phone: "(11) 98252-6815",
    document: "441.179.848-45",
    counter: "",
    notes: "",
  },
  {
    id: "supplier-tcheco",
    name: "Tcheco",
    type: "Balcão do Dicas",
    contact: "73984957395",
    phone: "73984957395",
    document: "",
    counter: "Balcão do Dicas",
    notes: "",
  },
  {
    id: "supplier-izzy-trip",
    name: "Izzy trip",
    type: "Balcão",
    contact: "(19) 98603-5843",
    phone: "(19) 98603-5843",
    document: "",
    counter: "Balcão",
    notes: "",
  },
];

function defaultData(): CRMData {
  const q1 = defaultQuote();
  q1.isDemo = true;
  const q2 = {
    ...defaultQuote(),
    isDemo: true,
    id: uid(),
    client: "Família Exemplo",
    destination: "RIO DE JANEIRO - RJ",
    route: "GRU → MAO → GRU",
    status: "emitido" as Status,
    cashPrice: 5850,
    cost: 4980,
  };
  const q3 = {
    ...defaultQuote(),
    isDemo: true,
    id: uid(),
    client: "Mariana Exemplo",
    destination: "SÃO PAULO - SP",
    route: "FOR → GRU",
    status: "aguardando" as Status,
    cashPrice: 3290,
    cost: 2740,
  };
  return {
    quotes: [q1, q2, q3],
    clients: [
      ...importedClients,
      {
        id: uid(),
        name: "Cliente Exemplo",
        phone: "(11) 99999-0000",
        email: "cliente@example.com",
        birthday: "1994-09-07",
        document: "000.000.000-00",
        passport: "FA123456",
        origin: "Indicação",
      },
      {
        id: uid(),
        name: "Mariana Exemplo",
        phone: "(85) 98888-0000",
        email: "mariana@example.com",
        birthday: "1988-09-05",
        document: "111.111.111-11",
        passport: "GA987654",
        origin: "Instagram",
      },
    ],
    suppliers: requestedSuppliers,
    events: [
      {
        id: uid(),
        title: "Confirmar check-in",
        date: todayIso(2),
        description: "Revisar documentos e enviar lembrete ao passageiro.",
      },
    ],
    settings: {
      contactName: "Ronaldo Macena",
      contactEmail: "",
      contactPhone: "(11) 98756-9836",
      companyName: "RM Partiu Viagens",
      document: "",
      instagram: "@rmpartiuviagens",
      address: "São Paulo - SP, Brasil",
      logoDataUrl: "",
      currency: "BRL",
      installmentRates: [4.02, 6.09, 7.01, 7.91, 8.08, 9.67, 12.59, 13.42, 14.25, 15.06, 15.87, 16.66],
    },
  };
}
function normalizeQuote(value: Partial<Quote>): Quote {
  const base = defaultQuote();
  const isKnownDemo =
    value.client === "Família Exemplo" ||
    value.client === "Mariana Exemplo" ||
    (value.client === "Cliente Exemplo" && value.destination === "FORTALEZA - CE");
  const isDemo = Boolean(value.isDemo) || isKnownDemo;
  const placeholderFlightFields: Partial<Flight> = isDemo
    ? {
        checkedBags: 0,
        carryOnBags: 0,
        backpacks: 0,
        checkedBagWeight: 0,
        carryOnWeight: 0,
        pets: 0,
      }
    : {};
  return {
    ...base,
    ...value,
    createdAt: value.createdAt ?? "",
    isIssue: value.isIssue ?? Boolean(value.issue?.locator),
    name: isDemo ? "" : (value.name ?? base.name),
    isDemo,
    issue: { ...base.issue, ...value.issue },
    flightOut: normalizeFlight({ ...base.flightOut, ...value.flightOut, ...placeholderFlightFields }),
    flightBack: normalizeFlight({ ...base.flightBack, ...value.flightBack, ...placeholderFlightFields }),
    flightOutSegments: (value.flightOutSegments ?? []).map((flight) => normalizeFlight({ ...emptyFlight(), ...flight, segmentId: flight.segmentId ?? uid() })),
    flightBackSegments: (value.flightBackSegments ?? []).map((flight) => normalizeFlight({ ...emptyFlight(), ...flight, segmentId: flight.segmentId ?? uid() })),
    car: { ...base.car, ...value.car },
    hotel: { ...base.hotel, ...value.hotel },
    insurance: { ...base.insurance, ...value.insurance },
    carOptions: value.carOptions ?? [],
    hotelOptions: value.hotelOptions ?? [],
    insuranceOptions: value.insuranceOptions ?? [],
  };
}
function normalizeData(parsed: Partial<CRMData>): CRMData {
    const storedSuppliers = (Array.isArray(parsed.suppliers)
      ? parsed.suppliers
      : defaultData().suppliers
    ).filter(
      (supplier) =>
        !(supplier.name === "Azul Viagens" && supplier.contact === "azul.com.br") &&
        !(supplier.name === "Localiza" && supplier.contact === "Central reservas"),
    );
    const supplierNames = new Set(
      storedSuppliers.map((supplier) => supplier.name.trim().toLocaleLowerCase("pt-BR")),
    );
    const suppliers = [
      ...requestedSuppliers.filter(
        (supplier) => !supplierNames.has(supplier.name.toLocaleLowerCase("pt-BR")),
      ),
      ...storedSuppliers,
    ];
    return {
      quotes: Array.isArray(parsed.quotes)
        ? parsed.quotes.map(normalizeQuote)
        : defaultData().quotes,
      clients: mergeImportedClients(
        Array.isArray(parsed.clients) ? parsed.clients : defaultData().clients,
      ),
      suppliers,
      events: Array.isArray(parsed.events) ? parsed.events : defaultData().events,
      settings: { ...defaultData().settings, ...parsed.settings },
    };
}
function readData(): CRMData {
  try {
    const currentData = localStorage.getItem(STORAGE_KEY);
    const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
    const raw = currentData ?? legacyData;
    if (!raw) return defaultData();
    if (!currentData && legacyData) {
      localStorage.setItem(STORAGE_KEY, legacyData);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    return normalizeData(JSON.parse(raw) as Partial<CRMData>);
  } catch {
    return defaultData();
  }
}
function saveData(data: CRMData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function shareUrl(payload: SharedQuote) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${window.location.origin}/#share=${encoded}`;
}
function readSharedQuote(): SharedQuote | null {
  try {
    const encoded = window.location.hash.match(/^#share=(.+)$/)?.[1];
    if (!encoded) return null;
    const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as SharedQuote;
  } catch {
    return null;
  }
}
function openQuotePdfLegacy(quote: Quote, settings: AppSettings) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const blue = [36, 92, 235] as const;
  const dark = [15, 23, 42] as const;
  const muted = [88, 105, 128] as const;
  const line = [215, 222, 232] as const;
  const date = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "Data a confirmar";
  const text = (value: string, x: number, y: number, size = 9, color: readonly [number, number, number] = dark, style: "normal" | "bold" = "normal") => {
    pdf.setFont("helvetica", style); pdf.setFontSize(size); pdf.setTextColor(...color); pdf.text(value, x, y);
  };
  const centerText = (value: string, x: number, y: number, size = 9, color: readonly [number, number, number] = dark, style: "normal" | "bold" = "normal", maxWidth?: number) => {
    pdf.setFont("helvetica", style); pdf.setFontSize(size); pdf.setTextColor(...color); pdf.text(value, x, y, { align: "center", maxWidth });
  };
  const card = (x: number, y: number, width: number, height: number) => {
    pdf.setDrawColor(...line); pdf.setFillColor(255, 255, 255); pdf.roundedRect(x, y, width, height, 3, 3, "FD");
  };
  pdf.setFillColor(248, 250, 252); pdf.rect(0, 0, 210, 297, "F");
  centerText(`Sua próxima viagem está aqui, ${quote.client || "viajante"}`, 105, 22, 17, blue, "bold");
  centerText(quote.destination || "Destino a confirmar", 105, 30, 9, dark, "bold");
  centerText(`${date(quote.startDate)} - ${date(quote.endDate)}`, 105, 36, 7, muted);
  card(15, 44, 180, 30);
  text(settings.companyName, 26, 55, 11, dark, "bold");
  text(settings.address || "Agência de viagens", 26, 62, 7, muted);
  text(`Atendente: ${settings.contactName}`, 125, 55, 8, dark, "bold");
  text(settings.contactPhone, 125, 62, 7, muted);
  text(settings.contactEmail, 125, 67, 7, muted);
  let y = 84;
  text("Voos", 15, y, 12, dark, "bold"); y += 6;
  const renderFlight = (flight: Flight, title: string) => {
    card(15, y, 180, 55);
    pdf.setFillColor(flight.airline.toLowerCase().includes("gol") ? 250 : 25, flight.airline.toLowerCase().includes("gol") ? 108 : 75, flight.airline.toLowerCase().includes("gol") ? 31 : 155);
    pdf.roundedRect(21, y + 7, 35, 13, 3, 3, "F");
    centerText(flight.airline || "AÉREA", 38.5, y + 16, 12, [255, 255, 255], "bold", 31);
    text(title, 63, y + 10, 8, dark, "bold");
    text(`${flight.from || "Origem a confirmar"}  →  ${flight.to || "Destino a confirmar"}`, 63, y + 16, 7, muted);
    text(date(flight.date), 63, y + 21, 7, muted);
    text(flight.departTime || "--:--", 35, y + 32, 13, dark, "bold");
    centerText(flight.from || "Origem", 35, y + 38, 6, muted, "normal", 38);
    pdf.setDrawColor(...muted); pdf.line(58, y + 32, 151, y + 32); text("✈", 105, y + 34, 8, blue, "bold");
    centerText(flight.arriveTime || "--:--", 174, y + 32, 13, dark, "bold");
    centerText(flight.to || "Destino", 174, y + 38, 6, muted, "normal", 38);
    text(`Passageiros: ${flight.passengers.length}`, 22, y + 48, 7, dark, "bold");
    text(`Despachada: ${flight.checkedBags} (${flight.checkedBagWeight || 0} kg)`, 67, y + 48, 7, dark);
    text(`Mão: ${flight.carryOnBags} (${flight.carryOnWeight || 0} kg)`, 120, y + 48, 7, dark);
    text(`Mochila: ${flight.backpacks}`, 164, y + 48, 7, dark);
    y += 61;
  };
  [quote.flightOut, ...(quote.flightOutSegments ?? [])].forEach((flight, index) => {
    if (flight.from || flight.to || flight.code) renderFlight(flight, index ? `Viagem de ida · trecho ${index + 1}` : "Viagem de ida");
  });
  [quote.flightBack, ...(quote.flightBackSegments ?? [])].forEach((flight, index) => {
    if (flight.from || flight.to || flight.code) renderFlight(flight, index ? `Viagem de volta · trecho ${index + 1}` : "Viagem de volta");
  });
  if (quote.showValues) { card(15, y, 180, 20); text("Valor do orçamento", 22, y + 8, 8, muted); text(money(quote.cashPrice), 22, y + 15, 13, [5, 135, 83], "bold"); text(`${quote.installments}  ${quote.paymentOption}`, 90, y + 13, 8, dark); y += 27; }
  if (quote.notes) {
    if (y > 245) { pdf.addPage(); pdf.setFillColor(248, 250, 252); pdf.rect(0, 0, 210, 297, "F"); y = 18; }
    text("Informações adicionais", 15, y, 11, dark, "bold"); y += 6;
    const lines = pdf.splitTextToSize(quote.notes, 168) as string[];
    for (const noteLine of lines) {
      if (y > 282) { pdf.addPage(); pdf.setFillColor(248, 250, 252); pdf.rect(0, 0, 210, 297, "F"); y = 18; }
      text(noteLine, 21, y, 8, dark); y += 4.5;
    }
  }
  const url = URL.createObjectURL(pdf.output("blob"));
  const popup = window.open(url, "_blank");
  if (!popup) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function openQuotePdf(quote: Quote, settings: AppSettings) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const blue = [53, 79, 224] as const;
  const ink = [15, 23, 42] as const;
  const muted = [82, 96, 115] as const;
  const border = [205, 211, 220] as const;
  const orange = [255, 105, 20] as const;
  const margin = 8;
  const contentWidth = 194;
  const text = (value: string, x: number, y: number, size = 8, color: readonly [number, number, number] = ink, style: "normal" | "bold" = "normal", options: Record<string, unknown> = {}) => {
    pdf.setFont("helvetica", style); pdf.setFontSize(size); pdf.setTextColor(...color); pdf.text(value, x, y, options);
  };
  const center = (value: string, x: number, y: number, size = 8, color: readonly [number, number, number] = ink, style: "normal" | "bold" = "normal", maxWidth?: number) => {
    text(value, x, y, size, color, style, { align: "center", maxWidth });
  };
  const card = (x: number, y: number, width: number, height: number, radius = 4) => {
    pdf.setFillColor(255, 255, 255); pdf.setDrawColor(...border); pdf.setLineWidth(0.35); pdf.roundedRect(x, y, width, height, radius, radius, "FD");
  };
  const suitcaseIcon = (x: number, y: number, scale = 1, color: readonly [number, number, number] = ink) => {
    pdf.setDrawColor(...color); pdf.setLineWidth(0.45 * scale);
    pdf.roundedRect(x, y, 5 * scale, 5 * scale, 0.7, 0.7);
    pdf.line(x + 1.5 * scale, y, x + 1.5 * scale, y - 1.3 * scale);
    pdf.line(x + 1.5 * scale, y - 1.3 * scale, x + 3.5 * scale, y - 1.3 * scale);
    pdf.line(x + 3.5 * scale, y - 1.3 * scale, x + 3.5 * scale, y);
    pdf.circle(x + 1.2 * scale, y + 5.5 * scale, 0.3 * scale);
    pdf.circle(x + 3.8 * scale, y + 5.5 * scale, 0.3 * scale);
  };
  const fullDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "Data a confirmar";
  const dateRange = () => {
    if (!quote.startDate || !quote.endDate) return [fullDate(quote.startDate), fullDate(quote.endDate)].filter((value) => value !== "Data a confirmar").join(" — ") || "Datas a confirmar";
    const start = new Date(`${quote.startDate}T12:00:00`); const end = new Date(`${quote.endDate}T12:00:00`);
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    return sameMonth ? `${String(start.getDate()).padStart(2, "0")} — ${fullDate(quote.endDate)}` : `${fullDate(quote.startDate)} — ${fullDate(quote.endDate)}`;
  };
  const airportCode = (value: string) => value.split("-")[0]?.trim().toUpperCase() || "---";
  const airportName = (value: string) => value.split("-").slice(1).join("-").trim() || value || "A confirmar";
  const duration = (start: string, end: string) => {
    const [sh, sm] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number);
    if ([sh, sm, eh, em].some(Number.isNaN)) return "A confirmar";
    let minutes = eh * 60 + em - (sh * 60 + sm); if (minutes < 0) minutes += 1440;
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}min de voo`;
  };
  const page = () => { pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, 210, 297, "F"); };
  const svgMarkupToPng = async (svg: string, width = 480, height = 160) => {
    try {
      const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = objectUrl; });
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      canvas.getContext("2d")?.drawImage(image, 0, 0, width, height); URL.revokeObjectURL(objectUrl);
      return canvas.toDataURL("image/png");
    } catch { return ""; }
  };
  const svgToPng = async (url: string) => url ? svgMarkupToPng(await fetch(url).then((response) => response.text())) : "";
  const airlineAsset = (airline: string) => airline.toLowerCase().includes("latam") ? "/airlines/latam.svg" : airline.toLowerCase().includes("azul") ? "/airlines/azul.svg" : "";
  const airlineLogos = new Map<string, string>();
  for (const airline of [quote.flightOut, ...(quote.flightOutSegments ?? []), quote.flightBack, ...(quote.flightBackSegments ?? [])].map((flight) => flight.airline)) if (airline && !airlineLogos.has(airline)) airlineLogos.set(airline, await svgToPng(airlineAsset(airline)));
  const golLogoPng = await fetch("/airlines/gol.svg")
    .then((response) => response.text())
    .then((svg) => svgMarkupToPng(
      svg
        .replace("fill:#37322d;opacity:0.25", "fill:#ffb27d;opacity:1")
        .replace("fill:#ff7020", "fill:#ffffff"),
      488,
      200,
    ))
    .catch(() => "");
  const planeSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 4 2 2 4 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>';
  const takeoffSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22h20"/><path d="M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 2.79.84L7 15l6.5-3.5-4-7 2-.5 6 5 2.5-1.33a2.53 2.53 0 0 1 3.34.75 2.53 2.53 0 0 1-.97 3.68L8 17.35a2 2 0 0 1-1.64.05z"/></svg>';
  const usersSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8"/><path d="M16 3.13a5 5 0 0 1 0 9.75"/></svg>';
  const instagramSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>';
  const [planePng, takeoffPng, usersPng, instagramPng] = await Promise.all([
    svgMarkupToPng(planeSvg, 128, 128),
    svgMarkupToPng(takeoffSvg, 128, 128),
    svgMarkupToPng(usersSvg, 128, 128),
    svgMarkupToPng(instagramSvg, 128, 128),
  ]);

  page();
  const traveler = (quote.client.trim().split(/\s+/)[0] || "VIAJANTE").toUpperCase();
  center(`Sua próxima viagem está aqui, ${traveler}`, 105, 30, 17, blue, "bold");
  if (planePng) pdf.addImage(planePng, "PNG", 84.5, 35, 4, 4, undefined, "FAST");
  center((quote.destination || "DESTINO A CONFIRMAR").toUpperCase(), 110, 39, 8.5, ink, "bold");
  center(dateRange(), 105, 46, 6.5, muted);

  pdf.setFillColor(245, 245, 245); pdf.roundedRect(8, 59, contentWidth, 34, 5, 5, "F");
  card(8, 56, contentWidth, 34, 5);
  let logoRendered = false;
  if (settings.logoDataUrl) { try { pdf.addImage(settings.logoDataUrl, 12, 59, 27, 27, undefined, "FAST"); logoRendered = true; } catch { logoRendered = false; } }
  if (!logoRendered) { pdf.setFillColor(...orange); pdf.roundedRect(12, 59, 27, 27, 4, 4, "F"); center("RM", 25.5, 73, 12, [255,255,255], "bold"); center("VIAGENS", 25.5, 80, 4.5, [255,255,255], "bold"); }
  text("Somos a", 44, 64, 5.5, muted); text(settings.companyName || "RM Partiu Viagens", 44, 70, 8.5, ink, "bold");
  const agencyAddress = pdf.splitTextToSize(settings.address || "Endereço da agência", 82) as string[];
  agencyAddress.slice(0, 2).forEach((line, index) => text(line, 44, 76 + index * 4.5, 5.2, muted));
  const agencyMetaY = agencyAddress.length > 1 ? 87 : 83;
  if (instagramPng && settings.instagram) pdf.addImage(instagramPng, "PNG", 44, agencyMetaY - 3.4, 3.6, 3.6, undefined, "FAST");
  text(settings.instagram || "", settings.instagram ? 49 : 44, agencyMetaY, 5.1, muted);
  if (settings.document) text(`CNPJ/CPF: ${settings.document}`, 91, agencyMetaY, 4.8, muted, "normal", { maxWidth: 52 });
  text("Você está sendo atendido por", 153, 64, 5.5, muted); text(settings.contactName || "Seu consultor", 153, 70, 7.3, ink, "bold", { maxWidth: 43 });
  text("Precisa de ajuda?", 153, 77, 5.5, muted); text(settings.contactPhone || "", 153, 82, 6, ink, "bold"); text(settings.contactEmail || "", 153, 87, 5.1, ink, "bold", { maxWidth: 46 });

  let y = 106;
  if (planePng) pdf.addImage(planePng, "PNG", margin, y - 7, 8, 8, undefined, "FAST");
  text("Voos", margin + 11, y, 10, ink, "bold"); y += 6;
  const ensureSpace = (height: number) => { if (y + height <= 289) return; pdf.addPage(); page(); y = 12; };
  const renderFlight = (flight: Flight, title: string) => {
    ensureSpace(83);
    const isOutbound = title.startsWith("Ida");
    card(margin, y, contentWidth, 78, 4);
    const airline = flight.airline || "Companhia aérea";
    if (airline.toLowerCase().includes("gol")) {
      pdf.setFillColor(...orange); pdf.roundedRect(15, y + 7, 40, 16, 4, 4, "F");
      if (golLogoPng) pdf.addImage(golLogoPng, "PNG", 19, y + 9, 32, 12, undefined, "FAST");
      else center("GOL", 35, y + 19, 17, [255,255,255], "bold");
    } else {
      const logo = airlineLogos.get(flight.airline);
      if (logo) pdf.addImage(logo, "PNG", 16, y + 9, 38, 12, undefined, "FAST");
      else { pdf.setFillColor(...blue); pdf.roundedRect(15, y + 7, 40, 16, 4, 4, "F"); center(airline.toUpperCase(), 35, y + 18, 10, [255,255,255], "bold", 34); }
    }
    if (takeoffPng) pdf.addImage(takeoffPng, "PNG", 70, y + 7, 5.5, 5.5, undefined, "FAST");
    text(isOutbound ? "Saindo de" : "Com destino", 78, y + 10, 4.7, muted); text(`${airportName(flight.from)} (${airportCode(flight.from)})`, 78, y + 15, 6.3, ink, "bold", { maxWidth: 39 });
    if (takeoffPng) pdf.addImage(takeoffPng, "PNG", 112, y + 7, 5.5, 5.5, undefined, "FAST");
    text(isOutbound ? "Com destino" : "Saindo de", 120, y + 10, 4.7, muted); text(`${airportName(flight.to)} (${airportCode(flight.to)})`, 120, y + 15, 6.3, ink, "bold", { maxWidth: 39 });
    text("Classe", 174, y + 10, 4.7, muted); text(flight.cabinClass || "Econômica", 174, y + 16, 7.5, muted, "bold");
    if (usersPng) pdf.addImage(usersPng, "PNG", 174, y + 19.5, 5, 5, undefined, "FAST");
    text(String(flight.passengers.length), 181, y + 24, 7.5, muted, "bold");
    center(`em ${fullDate(flight.date || (isOutbound ? quote.startDate : quote.endDate))}`, 112, y + 23, 5.8, muted);
    pdf.setDrawColor(225, 228, 234); pdf.line(15, y + 28, 195, y + 28);
    center(flight.departTime || "--:--", 49, y + 37, 10, ink, "bold"); center(`${airportCode(flight.from)} em ${airportName(flight.from)}`, 49, y + 42, 5.8, muted, "normal", 50);
    center("Duração", 105, y + 38, 4.8, muted); center(duration(flight.departTime, flight.arriveTime), 105, y + 44, 5.8, ink, "bold");
    center(flight.arriveTime || "--:--", 163, y + 37, 10, ink, "bold"); center(`${airportCode(flight.to)} em ${airportName(flight.to)}`, 163, y + 42, 5.8, muted, "normal", 50);
    pdf.line(15, y + 49, 195, y + 49);
    text("O que está incluso?", 15, y + 60, 6.5, ink, "bold");
    suitcaseIcon(63, y + 57, 1.15); text(String(flight.checkedBags), 86, y + 62, 16, ink, "bold", { align: "right" }); text(`bagagem\ndespachada (${flight.checkedBagWeight || 0}kg)`, 89, y + 57, 5, ink);
    text(String(flight.carryOnBags), 134, y + 62, 16, ink, "bold", { align: "right" }); text(`bagagem\nde bordo (${flight.carryOnWeight || 0}kg)`, 137, y + 57, 5, ink);
    text(String(flight.backpacks), 177, y + 62, 16, ink, "bold", { align: "right" }); text("mochila\nou bolsa", 180, y + 57, 5, ink);
    text(`Esta reserva ${flight.refundable ? "é" : "não é"} reembolsável`, 15, y + 72, 5.8, muted);
    y += 85;
  };
  const hasFlight = (flight: Flight) => Boolean(flight.code || flight.from || flight.to || flight.date);
  const outboundFlights = [quote.flightOut, ...(quote.flightOutSegments ?? [])];
  const returnFlights = [quote.flightBack, ...(quote.flightBackSegments ?? [])];
  outboundFlights.forEach((flight, index) => { if (hasFlight(flight)) renderFlight(syncPassengerBaggage(flight), index ? `Ida · trecho ${index + 1}` : "Ida"); });
  returnFlights.forEach((flight, index) => { if (hasFlight(flight)) renderFlight(syncPassengerBaggage(flight), index ? `Volta · trecho ${index + 1}` : "Volta"); });
  if (![...outboundFlights, ...returnFlights].some(hasFlight)) { openQuotePdfLegacy(quote, settings); return; }

  if (quote.showValues || quote.notes) {
    ensureSpace(74);
    text("i", margin + 2.5, y + 1, 8, ink, "bold", { align: "center" }); pdf.setDrawColor(...ink); pdf.circle(margin + 2.5, y - 1.5, 3.3);
    text("Informações adicionais", margin + 10, y, 10, ink, "bold"); y += 6;
    const calculation = installmentCalculation(quote.cashPrice, quote.installments);
    const notesLines: string[] = [];
    if (quote.showValues) {
      notesLines.push(`Opção 1 – PIX\n${money(quote.cashPrice)}`);
      if (calculation) notesLines.push(`Opção 2 – Entrada + Parcelamento\n${calculation.installments}x de ${money(calculation.installmentValue)} • Total ${money(calculation.total)}`);
      else if (quote.paymentOption) notesLines.push(`Opção 2 – ${quote.paymentOption}`);
    }
    if (quote.notes.trim()) notesLines.push(quote.notes.trim());
    const terms = "Termos e Condições\nAlterações:\nEsta reserva não permite alterações gratuitas. Para alterações da reserva, horário e/ou data, consulte a agência para saber a taxa de remarcação e serviço, além da possível diferença tarifária.\n\nCancelamento:\nAs regras e taxas de cancelamento seguem as condições da tarifa e do fornecedor escolhido.";
    notesLines.push(terms);
    const wrapped: string[] = [];
    notesLines.forEach((block, index) => { if (index) wrapped.push(""); block.split("\n").forEach((lineValue) => wrapped.push(...(pdf.splitTextToSize(lineValue, 180) as string[]))); });
    const boxHeight = Math.max(65, 12 + wrapped.length * 4.4);
    if (y + boxHeight > 289) { pdf.addPage(); page(); y = 12; }
    card(margin, y, contentWidth, Math.min(boxHeight, 275 - y), 4);
    let lineY = y + 9;
    wrapped.forEach((lineValue) => {
      if (lineY > 282) { pdf.addPage(); page(); lineY = 15; }
      const heading = lineValue.startsWith("Opção") || lineValue === "Termos e Condições" || lineValue === "Alterações:" || lineValue === "Cancelamento:";
      text(lineValue, margin + 7, lineY, heading ? 7.2 : 6.5, ink, heading ? "bold" : "normal"); lineY += 4.4;
    });
  }

  const url = URL.createObjectURL(pdf.output("blob"));
  const popup = window.open(url, "_blank");
  if (!popup) { const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.click(); }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function openIssuePdfLegacy(issue: Quote, settings: AppSettings) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const companyLogo = settings.logoDataUrl;
  const ink = [14, 25, 46] as const;
  const muted = [91, 107, 132] as const;
  const blue = [23, 91, 211] as const;
  const paleBlue = [243, 247, 255] as const;
  const border = [211, 220, 233] as const;
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const date = (value: string) => value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "Data a confirmar";
  const shortAirport = (value: string) => value.split("-")[0]?.trim() || value || "---";
  const text = (value: string, x: number, y: number, size = 8, color: readonly [number, number, number] = ink, style: "normal" | "bold" = "normal", options: Record<string, unknown> = {}) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    pdf.text(value, x, y, options);
  };
  const line = (x1: number, y1: number, x2: number, y2: number, color: readonly [number, number, number] = border) => {
    pdf.setDrawColor(...color);
    pdf.line(x1, y1, x2, y2);
  };
  const pageBackground = () => {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
  };
  const header = () => {
    pageBackground();
    if (issue.issue.showLogo && companyLogo) {
      try {
        pdf.addImage(companyLogo, margin, 12, 20, 20, undefined, "FAST");
      } catch {
        pdf.setFillColor(245, 126, 36);
        pdf.roundedRect(margin, 12, 20, 20, 3, 3, "F");
        text("RM", margin + 10, 25, 10, [255, 255, 255], "bold", { align: "center" });
      }
    } else {
      pdf.setFillColor(245, 126, 36);
      pdf.roundedRect(margin, 12, 20, 20, 3, 3, "F");
      text("RM", margin + 10, 25, 10, [255, 255, 255], "bold", { align: "center" });
    }
    text(settings.companyName || "RM Partiu Viagens", 38, 19, 9, ink, "bold");
    text(settings.contactName || "Sua agência de viagens", 38, 25, 7, muted);
    const locators = [issue.issue.locator, issue.flightBack.code ? issue.issue.ticket : ""].filter(Boolean).join("  |  ");
    text(locators ? `LOCALIZADOR: ${locators}` : "LOCALIZADOR NÃO INFORMADO", pageWidth - margin, 18, 7, ink, "bold", { align: "right" });
    text(issue.client || "Passageiro", pageWidth - margin, 24, 7, muted, "normal", { align: "right" });
    line(margin, 37, pageWidth - margin, 37);
  };
  const ensureSpace = (height: number, currentY: number) => {
    if (currentY + height <= pageHeight - 14) return currentY;
    pdf.addPage();
    header();
    return 45;
  };
  header();
  let y = 46;
  text(issue.name || `Emissão de ${issue.client}`, margin, y, 13, ink, "bold");
  text(`${issue.destination || issue.route || "Viagem"}  •  ${issue.issue.locator || "Sem localizador"}`, margin, y + 6, 7, muted);
  y += 15;

  const renderFlight = (flight: Flight, title: string, fallbackDate: string) => {
    if (!flight.code && !flight.from && !flight.to && !flight.date && !fallbackDate) return;
    const passengers = flight.passengers.length ? flight.passengers : [{ id: "empty", name: issue.client, surname: "", ticket: issue.issue.ticket, checkedBags: flight.checkedBags, carryOnBags: flight.carryOnBags, backpacks: flight.backpacks }];
    const blockHeight = 55 + passengers.length * 17;
    y = ensureSpace(blockHeight, y);
    text(title, margin, y, 10, ink, "bold");
    text(`${date(flight.date || fallbackDate)}  •  ${passengers.length} passageiro${passengers.length === 1 ? "" : "s"}`, pageWidth - margin, y, 7, muted, "normal", { align: "right" });
    y += 5;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(...border);
    pdf.roundedRect(margin, y, pageWidth - margin * 2, 31, 3, 3, "FD");
    pdf.setFillColor(...paleBlue);
    pdf.roundedRect(margin + 4, y + 4, 40, 23, 2, 2, "F");
    text((flight.airline || issue.issue.provider || "AÉREA").toUpperCase(), margin + 24, y + 12, 9, blue, "bold", { align: "center", maxWidth: 35 });
    text(flight.code || "Voo a confirmar", margin + 24, y + 20, 7, ink, "bold", { align: "center" });
    text(flight.departTime || "--:--", margin + 54, y + 10, 11, ink, "bold");
    text(shortAirport(flight.from), margin + 54, y + 17, 7, ink, "bold");
    text(flight.from || "Origem a confirmar", margin + 54, y + 23, 5.8, muted, "normal", { maxWidth: 42 });
    line(margin + 97, y + 15, margin + 125, y + 15, blue);
    pdf.setFillColor(...blue);
    pdf.circle(margin + 111, y + 15, 1.4, "F");
    text(flight.arriveTime || "--:--", pageWidth - margin - 6, y + 10, 11, ink, "bold", { align: "right" });
    text(shortAirport(flight.to), pageWidth - margin - 6, y + 17, 7, ink, "bold", { align: "right" });
    text(flight.to || "Destino a confirmar", pageWidth - margin - 6, y + 23, 5.8, muted, "normal", { align: "right", maxWidth: 42 });
    y += 38;
    text("PASSAGEIROS", margin, y, 7, muted, "bold");
    y += 4;
    passengers.forEach((passenger) => {
      pdf.setFillColor(...paleBlue);
      pdf.roundedRect(margin, y, pageWidth - margin * 2, 14, 2, 2, "F");
      const passengerName = `${passenger.name || "Passageiro"} ${passenger.surname || ""}`.trim();
      text(passengerName, margin + 5, y + 5, 7.5, ink, "bold");
      text(passenger.ticket ? `E-ticket: ${passenger.ticket}` : "E-ticket não informado", margin + 5, y + 10, 6, muted);
      text(`Despachada: ${passenger.checkedBags || 0}`, margin + 92, y + 5, 6.5, blue, "bold");
      text(`Mão: ${passenger.carryOnBags || 0}`, margin + 126, y + 5, 6.5, blue, "bold");
      text(`Mochila: ${passenger.backpacks || 0}`, pageWidth - margin - 5, y + 5, 6.5, blue, "bold", { align: "right" });
      text(`Limites: ${flight.checkedBagWeight || 0} kg despachada • ${flight.carryOnWeight || 10} kg de mão`, pageWidth - margin - 5, y + 10, 5.8, muted, "normal", { align: "right" });
      y += 17;
    });
    y += 5;
  };

  if (issue.issueType === "flight") {
    renderFlight(issue.flightOut, `Sua viagem de ida para ${issue.flightOut.to || issue.destination || "o destino"}`, issue.startDate);
    renderFlight(issue.flightBack, `Sua viagem de volta para ${issue.flightBack.to || "casa"}`, issue.endDate);
  } else {
    y = ensureSpace(60, y);
    text(issue.issueType === "car" ? "Reserva de carro" : "Reserva de hospedagem", margin, y, 11, ink, "bold");
    y += 7;
    pdf.setFillColor(...paleBlue);
    pdf.roundedRect(margin, y, pageWidth - margin * 2, 35, 3, 3, "F");
    if (issue.issueType === "car") {
      text(issue.car.models || "Modelo a confirmar", margin + 6, y + 9, 9, ink, "bold");
      text(`Retirada: ${date(issue.car.pickupDate)} às ${issue.car.pickupTime || "--:--"}`, margin + 6, y + 17, 7, muted);
      text(`Devolução: ${date(issue.car.returnDate)} às ${issue.car.returnTime || "--:--"}`, margin + 6, y + 24, 7, muted);
      text(issue.car.pickupAddress || "Local de retirada a confirmar", margin + 6, y + 31, 6.5, muted);
    } else {
      text(issue.hotel.name || "Hospedagem a confirmar", margin + 6, y + 9, 9, ink, "bold");
      text(`Check-in: ${date(issue.hotel.checkin)} • Check-out: ${date(issue.hotel.checkout)}`, margin + 6, y + 18, 7, muted);
      text(issue.hotel.address || "Endereço a confirmar", margin + 6, y + 27, 7, muted);
    }
  }
  line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
  text(`${settings.companyName || "RM Partiu Viagens"} • ${settings.contactPhone || settings.contactEmail || ""}`, pageWidth / 2, pageHeight - 7, 6, muted, "normal", { align: "center" });
  const url = URL.createObjectURL(pdf.output("blob"));
  const popup = window.open(url, "_blank");
  if (!popup) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function openCarIssuePdf(issue: Quote, settings: AppSettings) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const ink = [12, 23, 43] as const;
  const muted = [78, 91, 111] as const;
  const border = [210, 215, 222] as const;
  const text = (value: string, x: number, y: number, size = 8, color: readonly [number, number, number] = ink, style: "normal" | "bold" = "normal", options: Record<string, unknown> = {}) => {
    pdf.setFont("helvetica", style); pdf.setFontSize(size); pdf.setTextColor(...color); pdf.text(value, x, y, options);
  };
  const date = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "A confirmar";
  const shortDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) : "A confirmar";
  const periodLabel = (() => {
    if (!issue.car.pickupDate || !issue.car.returnDate) return `${shortDate(issue.car.pickupDate)} – ${shortDate(issue.car.returnDate)}`;
    const start = new Date(`${issue.car.pickupDate}T12:00:00`);
    const end = new Date(`${issue.car.returnDate}T12:00:00`);
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) return `${start.getDate()} — ${end.getDate()} de ${end.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;
    return `${shortDate(issue.car.pickupDate)} – ${shortDate(issue.car.returnDate)}`;
  })();
  const days = issue.car.pickupDate && issue.car.returnDate ? Math.max(1, Math.ceil((new Date(`${issue.car.returnDate}T12:00:00`).getTime() - new Date(`${issue.car.pickupDate}T12:00:00`).getTime()) / 86400000)) : 0;
  const carIcon = (x: number, y: number) => { pdf.setDrawColor(...ink); pdf.setLineWidth(0.7); pdf.roundedRect(x, y + 2, 9, 4, 1, 1); pdf.line(x + 2, y + 2, x + 3.5, y); pdf.line(x + 3.5, y, x + 7, y); pdf.line(x + 7, y, x + 8, y + 2); pdf.circle(x + 2, y + 7, 1); pdf.circle(x + 7, y + 7, 1); };
  const pinIcon = (x: number, y: number) => { pdf.setDrawColor(...ink); pdf.setLineWidth(0.55); pdf.circle(x, y, 2); pdf.circle(x, y, 0.65); pdf.line(x - 1.4, y + 1.4, x, y + 3.4); pdf.line(x, y + 3.4, x + 1.4, y + 1.4); };
  const featureIcon = (x: number, y: number, index: number) => { pdf.setDrawColor(...ink); pdf.setLineWidth(0.45); if (index % 3 === 0) { pdf.circle(x, y, 2); pdf.line(x - 2.8, y, x + 2.8, y); pdf.line(x, y - 2.8, x, y + 2.8); } else if (index % 3 === 1) { pdf.roundedRect(x - 2, y - 2, 4, 4, 0.6, 0.6); } else { pdf.circle(x - 1.2, y - 1, 0.8); pdf.circle(x + 1.2, y - 1, 0.8); pdf.line(x - 2.5, y + 2, x - 2, y); pdf.line(x - 2, y, x + 2, y); pdf.line(x + 2, y, x + 2.5, y + 2); } };
  pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, 297, 210, "F");
  let logoRendered = false;
  if (issue.issue.showLogo && settings.logoDataUrl) {
    try { pdf.addImage(settings.logoDataUrl, 10, 10, 36, 36, undefined, "FAST"); logoRendered = true; } catch { logoRendered = false; }
  }
  if (!logoRendered) { pdf.setFillColor(255, 105, 0); pdf.roundedRect(10, 10, 36, 36, 5, 5, "F"); text("RM", 28, 30, 16, [255, 255, 255], "bold", { align: "center" }); text("VIAGENS", 28, 39, 5, [255, 255, 255], "bold", { align: "center" }); }
  const qrValue = issue.qrContent || issue.issue.locatorLink || issue.issue.locator;
  const qrImage = qrValue ? await QRCode.toDataURL(qrValue, { margin: 0, width: 320, errorCorrectionLevel: "M" }) : "";
  text("Seu localizador é", 245, 21, 7, muted, "normal", { align: "right" });
  text(issue.issue.locator || "NÃO INFORMADO", 245, 29, 11, ink, "bold", { align: "right" });
  text("Clique ou escaneie o QR Code", 245, 36, 5.8, muted, "normal", { align: "right" });
  if (qrImage) pdf.addImage(qrImage, "PNG", 252, 15, 24, 24, undefined, "FAST");
  else { pdf.setDrawColor(...border); pdf.rect(252, 15, 24, 24); text("QR", 264, 29, 9, muted, "bold", { align: "center" }); }

  carIcon(10, 58); text("Carros", 24, 66, 14, ink, "bold");
  pdf.setDrawColor(...border); pdf.setFillColor(255, 255, 255); pdf.roundedRect(10, 73, 267, 109, 7, 7, "FD");
  pdf.setFillColor(...ink); pdf.roundedRect(19, 82, 62, 10, 5, 5, "F"); text(periodLabel, 50, 88.7, 7, [255, 255, 255], "normal", { align: "center" });
  pdf.roundedRect(86, 82, 29, 10, 5, 5, "F"); text(days ? `${days} diária${days === 1 ? "" : "s"}` : "Diárias", 100.5, 88.7, 7, [255, 255, 255], "normal", { align: "center" });
  pinIcon(21, 101); text("Retirada", 26, 103, 9, ink, "bold"); pinIcon(147, 101); text("Devolução", 152, 103, 9, ink, "bold");
  text(`${date(issue.car.pickupDate)} • ${issue.car.pickupTime || "--:--"}`, 19, 112, 7.5, ink);
  text(`${date(issue.car.returnDate)} • ${issue.car.returnTime || "--:--"}`, 145, 112, 7.5, ink);
  const pickupLines = pdf.splitTextToSize(issue.car.pickupAddress || "Local de retirada a confirmar", 112) as string[];
  const returnLines = pdf.splitTextToSize(issue.car.returnAddress || issue.car.pickupAddress || "Local de devolução a confirmar", 112) as string[];
  pickupLines.slice(0, 2).forEach((line, index) => text(line, 19, 119 + index * 5, 7, ink));
  returnLines.slice(0, 2).forEach((line, index) => text(line, 145, 119 + index * 5, 7, ink));
  carIcon(19, 133); text("Modelos", 31, 141, 9, ink, "bold"); text(issue.car.models || "Modelo a confirmar", 19, 150, 8.2, muted);
  const features = [
    issue.car.airConditioning && "Ar condicionado", issue.car.airbag && "Air Bag", `${issue.car.passengers || 0} lugares`, `${issue.car.doors || 0} portas`,
    issue.car.powerSteering && "Direção elétrica", issue.car.electricLocks && "Trava elétrica", issue.car.automatic && "Transmissão automática", issue.car.abs && "Freio ABS", issue.car.electricWindows && "Vidros elétricos",
  ].filter(Boolean) as string[];
  features.forEach((feature, index) => { const x = 21 + (index % 5) * 49; const y = 161 + Math.floor(index / 5) * 11; featureIcon(x, y - 1.5, index); text(feature, x + 6, y, 7.6, ink); });
  text(`Esta reserva ${issue.car.refundable ? "é" : "não é"} reembolsável`, 19, 178, 8, muted);
  const url = URL.createObjectURL(pdf.output("blob"));
  const popup = window.open(url, "_blank");
  if (!popup) { const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.click(); }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function openIssuePdf(issue: Quote, settings: AppSettings) {
  if (issue.issueType === "car") { await openCarIssuePdf(issue, settings); return; }
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const ink = [12, 23, 43] as const;
  const muted = [101, 112, 130] as const;
  const blue = [0, 103, 230] as const;
  const pale = [244, 246, 255] as const;
  const border = [204, 211, 221] as const;
  const margin = 8;
  const pageWidth = 210;
  const pageHeight = 297;
  const text = (value: string, x: number, y: number, size = 8, color: readonly [number, number, number] = ink, style: "normal" | "bold" = "normal", options: Record<string, unknown> = {}) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    pdf.text(value, x, y, options);
  };
  const takeoffIcon = (x: number, y: number, scale = 1) => {
    pdf.setDrawColor(...ink);
    pdf.setLineWidth(0.55 * scale);
    pdf.setLineCap("round");
    pdf.setLineJoin("round");
    pdf.line(x, y + 2.2 * scale, x + 8.8 * scale, y + 2.2 * scale);
    pdf.lines([
      [1.7 * scale, 0.3 * scale],
      [0.9 * scale, -0.35 * scale],
      [-1.5 * scale, -3.1 * scale],
      [0.9 * scale, -0.25 * scale],
      [2.7 * scale, 2.15 * scale],
      [1.45 * scale, -0.75 * scale],
      [1.15 * scale, -0.05 * scale],
      [0.55 * scale, 0.65 * scale],
      [-0.25 * scale, 0.75 * scale],
      [-5.7 * scale, 1.95 * scale],
      [-1.55 * scale, 0.1 * scale],
    ], x + 0.8 * scale, y - 0.3 * scale);
  };
  const suitcaseIcon = (x: number, y: number, color: readonly [number, number, number] = blue, scale = 1) => {
    pdf.setDrawColor(...color); pdf.setLineWidth(0.4 * scale);
    pdf.roundedRect(x, y, 4.8 * scale, 4.2 * scale, 0.6, 0.6);
    pdf.line(x + 1.5 * scale, y, x + 1.5 * scale, y - 1.2 * scale);
    pdf.line(x + 1.5 * scale, y - 1.2 * scale, x + 3.3 * scale, y - 1.2 * scale);
    pdf.line(x + 3.3 * scale, y - 1.2 * scale, x + 3.3 * scale, y);
    pdf.circle(x + 1.1 * scale, y + 4.7 * scale, 0.28 * scale);
    pdf.circle(x + 3.7 * scale, y + 4.7 * scale, 0.28 * scale);
  };
  const backpackIcon = (x: number, y: number, color: readonly [number, number, number] = blue, scale = 1) => {
    pdf.setDrawColor(...color); pdf.setLineWidth(0.4 * scale);
    pdf.roundedRect(x, y, 4.6 * scale, 5 * scale, 1, 1);
    pdf.line(x + 1.4 * scale, y, x + 1.4 * scale, y - 0.8 * scale);
    pdf.line(x + 1.4 * scale, y - 0.8 * scale, x + 3.2 * scale, y - 0.8 * scale);
    pdf.line(x + 3.2 * scale, y - 0.8 * scale, x + 3.2 * scale, y);
    pdf.line(x + 1 * scale, y + 3.3 * scale, x + 3.6 * scale, y + 3.3 * scale);
  };
  const passengersIcon = (x: number, y: number) => {
    pdf.setDrawColor(...ink); pdf.setLineWidth(0.35);
    pdf.circle(x + 1.2, y - 1.6, 0.8);
    pdf.circle(x + 3.6, y - 1.2, 0.65);
    pdf.line(x, y + 1.2, x + 0.4, y + 0.2);
    pdf.line(x + 0.4, y + 0.2, x + 2, y + 0.2);
    pdf.line(x + 2, y + 0.2, x + 2.4, y + 1.2);
    pdf.line(x + 2.5, y + 1.2, x + 2.8, y + 0.4);
    pdf.line(x + 2.8, y + 0.4, x + 4.4, y + 0.4);
    pdf.line(x + 4.4, y + 0.4, x + 4.7, y + 1.2);
  };
  const fullDate = (value: string) => value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "Data a confirmar";
  const compactDate = (value: string) => fullDate(value).replace(/ de (\d{4})$/, "");
  const airportCode = (value: string) => value.split("-")[0]?.trim().toUpperCase() || "---";
  const airportName = (value: string) => value.split("-").slice(1).join("-").trim() || value || "A confirmar";
  const cityName = (value: string) => airportName(value).split(/[,/]/)[0].trim() || "o destino";
  const flightDuration = (start: string, end: string) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    if ([sh, sm, eh, em].some(Number.isNaN)) return "A confirmar";
    let minutes = eh * 60 + em - (sh * 60 + sm);
    if (minutes < 0) minutes += 1440;
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}min`;
  };
  const airlineAsset = (airline: string) => {
    const name = airline.toLocaleLowerCase("pt-BR");
    if (name.includes("latam")) return "/airlines/latam.svg";
    if (name.includes("gol")) return "/airlines/gol.svg";
    if (name.includes("azul")) return "/airlines/azul.svg";
    return "";
  };
  const svgToPng = async (url: string) => {
    if (!url) return "";
    try {
      const svg = await fetch(url).then((response) => response.text());
      const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Logo inválido"));
        image.src = objectUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 160;
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      return canvas.toDataURL("image/png");
    } catch {
      return "";
    }
  };
  const logos = new Map<string, string>();
  for (const airline of [issue.flightOut.airline, issue.flightBack.airline]) {
    if (airline && !logos.has(airline)) logos.set(airline, await svgToPng(airlineAsset(airline)));
  }
  const qrValue = issue.qrContent || issue.issue.locatorLink || issue.issue.locator;
  const qrImage = qrValue ? await QRCode.toDataURL(qrValue, { margin: 0, width: 320, errorCorrectionLevel: "M" }) : "";

  const pageHeader = () => {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    let renderedLogo = false;
    if (issue.issue.showLogo && settings.logoDataUrl) {
      try { pdf.addImage(settings.logoDataUrl, margin, 5, 23, 23, undefined, "FAST"); renderedLogo = true; }
      catch { renderedLogo = false; }
    }
    if (!renderedLogo) {
      pdf.setFillColor(246, 126, 31);
      pdf.roundedRect(margin, 5, 23, 23, 3, 3, "F");
      text("RM", margin + 11.5, 18, 11, [255, 255, 255], "bold", { align: "center" });
      text("VIAGENS", margin + 11.5, 24, 4.5, [255, 255, 255], "bold", { align: "center" });
    }
    text("Seu localizador é", 159, 9, 5.2, muted, "normal", { align: "right" });
    const locatorParts = (issue.issue.locator || "Não informado").split(/[|,;/]+/).map((part) => part.trim()).filter(Boolean);
    const locatorPrefixes = [issue.flightOut.code.slice(0, 2), issue.flightBack.code.slice(0, 2)];
    const locatorLabel = locatorParts.map((part, index) => locatorPrefixes[index] ? `${locatorPrefixes[index]}: ${part}` : part).join(" | ");
    text(locatorLabel, 159, 15, 7.3, ink, "bold", { align: "right", maxWidth: 105 });
    text("Clique ou escaneie o QR Code", 159, 20, 4.8, muted, "normal", { align: "right" });
    if (qrImage) pdf.addImage(qrImage, "PNG", 175, 5, 23, 23, undefined, "FAST");
    else {
      pdf.setDrawColor(...border); pdf.rect(175, 5, 23, 23);
      text("QR", 186.5, 18, 9, muted, "bold", { align: "center" });
    }
  };

  pageHeader();
  let y = 36;
  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - 8) return;
    pdf.addPage();
    pageHeader();
    y = 35;
  };
  const renderFlight = (flight: Flight, direction: "ida" | "volta", fallbackDate: string) => {
    if (!flight.code && !flight.from && !flight.to && !flight.date && !fallbackDate) return;
    const travelDate = flight.date || fallbackDate;
    const passengers = flight.passengers.length ? flight.passengers : [defaultPassenger()];
    const rows = Math.ceil(passengers.length / 3);
    ensureSpace(80 + rows * 33);
    takeoffIcon(margin, y - 1, 0.8);
    text(`Sua viagem de ${direction} para ${cityName(flight.to || issue.destination)}`, margin + 8, y, 9.2, ink, "bold");
    passengersIcon(pageWidth - margin - 8, y - 0.2);
    text(String(passengers.length), pageWidth - margin, y, 7.5, ink, "bold", { align: "right" });
    text(fullDate(travelDate), margin + 8, y + 5, 5.5, muted);
    y += 9;

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(...border);
    pdf.roundedRect(margin, y, pageWidth - margin * 2, 38, 3, 3, "FD");
    const airline = flight.airline || issue.issue.provider || "Companhia aérea";
    const airlineLogo = logos.get(flight.airline);
    if (airlineLogo) pdf.addImage(airlineLogo, "PNG", margin + 8, y + 7, 34, 11, undefined, "FAST");
    else text(airline.toUpperCase(), margin + 25, y + 14, 8.5, blue, "bold", { align: "center", maxWidth: 36 });
    text(flight.code || "Voo a confirmar", margin + 25, y + 27, 6.4, ink, "bold", { align: "center" });
    text("Classe", margin + 54, y + 12, 4.8, muted);
    text("Econômica", margin + 54, y + 19, 6.3, ink, "bold");
    text(flight.departTime || "--:--", margin + 85, y + 9, 9.5, ink, "bold");
    text(compactDate(travelDate), margin + 85, y + 14, 4.5, muted);
    takeoffIcon(margin + 85, y + 22.5, 0.38);
    text(airportCode(flight.from), margin + 91, y + 24, 5.8, ink, "bold");
    text(airportName(flight.from), margin + 85, y + 30, 4.3, muted, "normal", { maxWidth: 34 });
    takeoffIcon(margin + 129.5, y + 15, 0.75);
    text(flightDuration(flight.departTime, flight.arriveTime), margin + 135, y + 23, 4.8, ink, "bold", { align: "center" });
    text(flight.arriveTime || "--:--", pageWidth - margin - 6, y + 9, 9.5, ink, "bold", { align: "right" });
    text(compactDate(travelDate), pageWidth - margin - 6, y + 14, 4.5, muted, "normal", { align: "right" });
    takeoffIcon(pageWidth - margin - 17, y + 22.5, 0.38);
    text(airportCode(flight.to), pageWidth - margin - 6, y + 24, 5.8, ink, "bold", { align: "right" });
    text(airportName(flight.to), pageWidth - margin - 6, y + 30, 4.3, muted, "normal", { align: "right", maxWidth: 34 });
    text(`Esta reserva ${flight.refundable ? "é" : "não é"} reembolsável`, margin, y + 43, 4.5, muted);
    y += 53;

    text("Passageiros", margin, y, 6.2, muted, "bold");
    y += 4;
    passengers.forEach((passenger, index) => {
      const column = index % 3;
      if (column === 0 && index > 0) y += 33;
      const x = margin + column * 64;
      pdf.setFillColor(...pale);
      pdf.roundedRect(x, y, 59, 29, 3, 3, "F");
      pdf.setFillColor(229, 233, 248); pdf.roundedRect(x + 4, y + 3, 8, 7, 2, 2, "F");
      suitcaseIcon(x + 5.5, y + 4.5, ink, 0.9);
      pdf.setFillColor(229, 233, 248); pdf.roundedRect(x + 14, y + 3, 41, 7, 2, 2, "F");
      suitcaseIcon(x + 17, y + 4.6, muted, 0.75);
      text(String(passenger.checkedBags || 0), x + 23, y + 8, 5, muted, "bold");
      suitcaseIcon(x + 27, y + 4.6, blue, 0.75);
      text(String(passenger.carryOnBags || 0), x + 33, y + 8, 5, blue, "bold");
      backpackIcon(x + 38, y + 4.5, blue, 0.75);
      text(String(passenger.backpacks || 0), x + 44, y + 8, 5, blue, "bold");
      const surname = passenger.surname || issue.client.split(" ").slice(1).join(" ") || "Passageiro";
      const firstName = passenger.name || issue.client.split(" ")[0] || "";
      text(surname, x + 5, y + 15, 5.8, ink, "bold", { maxWidth: 49 });
      text(firstName, x + 5, y + 20, 5.5, ink, "bold", { maxWidth: 49 });
      takeoffIcon(x + 5, y + 23.2, 0.34);
      text("E-ticket", x + 10, y + 24, 4.5, muted);
      text(passenger.ticket || issue.issue.ticket || "Não informado", x + 5, y + 28, 5.3, ink);
    });
    y += 35;
    suitcaseIcon(margin + 1, y - 4, blue, 0.8);
    text(`Bagagens despachadas (${flight.checkedBagWeight || 0}kg)`, margin + 8, y, 4.8, ink);
    suitcaseIcon(margin + 70, y - 4, blue, 0.8);
    text(`Bagagens de bordo (${flight.carryOnWeight || 0}kg)`, margin + 77, y, 4.8, ink);
    backpackIcon(margin + 144, y - 4, blue, 0.8);
    text("Mochila ou bolsa", margin + 151, y, 4.8, ink);
    y += 10;
    pdf.setDrawColor(164, 207, 243);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 10;
  };

  if (issue.issueType === "flight") {
    renderFlight(issue.flightOut, "ida", issue.startDate);
    renderFlight(issue.flightBack, "volta", issue.endDate);
  } else {
    openIssuePdfLegacy(issue, settings);
    return;
  }

  const url = URL.createObjectURL(pdf.output("blob"));
  const popup = window.open(url, "_blank");
  if (!popup) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function RMApp() {
  const [view, setView] = useState<ViewKey>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [data, setData] = useState<CRMData>({
    quotes: [],
    clients: [],
    suppliers: [],
    events: [],
    settings: defaultData().settings,
  });
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [quoteTab, setQuoteTab] = useState<QuoteTab>("trip");
  const [toast, setToast] = useState("");
  const [issueClientFilter, setIssueClientFilter] = useState("");
  const [lightTheme, setLightTheme] = useState(false);
  const [sharedQuote, setSharedQuote] = useState<SharedQuote | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [authVersion, setAuthVersion] = useState(0);
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const shared = readSharedQuote();
    if (shared) {
      setSharedQuote(shared);
      setReady(true);
      return;
    }
    const localData = readData();
    setData(localData);
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/crm-state", { cache: "no-store" });
        if (!active) return;
        if (response.status === 401) {
          setAuthRequired(true);
          setReady(true);
          return;
        }
        if (!response.ok) throw new Error("Banco de dados indisponível.");
        const payload = await response.json() as { data: Partial<CRMData> | null };
        if (payload.data) setData(normalizeData(payload.data));
        else {
          const initialSave = await fetch("/api/crm-state", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(localData),
          });
          if (!initialSave.ok) throw new Error("Não foi possível importar os dados locais.");
        }
        setAuthRequired(false);
        setRemoteEnabled(true);
        setRemoteError("");
      } catch (error) {
        if (active) setRemoteError(error instanceof Error ? error.message : "Falha de sincronização.");
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, [authVersion]);
  useEffect(() => {
    if (!ready) return;
    saveData(data);
    if (!remoteEnabled) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch("/api/crm-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((response) => {
        if (!response.ok) throw new Error("Falha ao salvar no banco.");
        setRemoteError("");
      }).catch(() => setRemoteError("Alterações salvas apenas neste dispositivo. Tentaremos sincronizar novamente."));
    }, 700);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [data, ready, remoteEnabled]);

  const totals = useMemo(() => {
    const issued = data.quotes.filter(
      (q) =>
        q.isIssue &&
        !q.isDemo &&
        q.status !== "cancelado",
    );
    const sales = issued.reduce((sum, q) => sum + q.cashPrice, 0);
    const costs = issued.reduce((sum, q) => sum + issueCost(q), 0);
    return {
      sales,
      profit: sales - costs,
      costs,
      quotes: data.quotes.length,
      issues: issued.length,
    };
  }, [data.quotes]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }
  function saveQuote(next: Quote) {
    setEditing(next);
    setData((cur) => ({
      ...cur,
      quotes: cur.quotes.some((q) => q.id === next.id)
        ? cur.quotes.map((q) => (q.id === next.id ? next : q))
        : [next, ...cur.quotes],
    }));
  }
  function createQuote() {
    const quote = blankQuote();
    setData((cur) => ({ ...cur, quotes: [quote, ...cur.quotes] }));
    setEditing(quote);
    setQuoteTab("trip");
    setView("quotes");
    flash("Novo orçamento criado.");
  }
  function createIssue() {
    const quote = {
      ...blankQuote(),
      id: uid(),
      isIssue: true,
      name: "",
      status: "emitido" as Status,
    };
    flash("Preencha os dados da emissão e clique em salvar.");
    return quote;
  }
  function removeQuote(id: string) {
    if (!confirm("Excluir este orçamento localmente?")) return;
    setData((cur) => ({
      ...cur,
      quotes: cur.quotes.filter((q) => q.id !== id),
    }));
    if (editing?.id === id) setEditing(null);
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "backup-rm-partiu-crm.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function importBackup(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setData(JSON.parse(String(reader.result)));
        flash("Backup importado.");
      } catch {
        flash("Arquivo inválido.");
      }
    };
    reader.readAsText(file);
  }

  if (!ready)
    return <div className="min-h-screen bg-[#000918]" aria-busy="true" aria-label="Carregando aplicação" />;
  if (authRequired) return <LoginState onSuccess={() => setAuthVersion((value) => value + 1)} />;
  if (sharedQuote) return <SharedQuotePage {...sharedQuote} />;
  return (
    <div
      className={`${lightTheme ? "theme-light" : ""} min-h-screen bg-[#000918] text-white lg:grid lg:grid-cols-[200px_1fr]`}
      suppressHydrationWarning
    >
      <aside className="hidden border-r border-[#1c3148] bg-[#0b1726] lg:flex lg:flex-col">
        <Brand />
        <Nav current={view} onChange={setView} />
        <div className="mt-auto grid gap-1 p-3">
          <button className="nav-secondary" onClick={() => setView("billing")}>Minha assinatura</button>
          <button className="nav-secondary" onClick={() => setView("settings")}>
            Configurações
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-[#1c3148] bg-[#0b1726]/95 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <button
              className="nav-secondary lg:hidden"
              onClick={() => setMenuOpen((o) => !o)}
            >
              Menu
            </button>
            <div className="hidden text-sm font-bold text-[#9fc8ee] lg:block">
              RM Partiu Viagens
            </div>
            <div className="flex items-center gap-2">
              <button className="icon-button" title="Novo orçamento" onClick={createQuote}>
                ✣
              </button>
              <button className="icon-button" title="Perfil" onClick={() => setView("settings")}>
                ◎
              </button>
              <button className="icon-button" title="Tema" onClick={() => setLightTheme((value) => !value)}>
                ☼
              </button>
            </div>
          </div>
          {menuOpen ? (
            <div className="mt-3 rounded-md border border-[#1c3148] bg-[#0b1726] p-2 lg:hidden">
              <Nav
                current={view}
                onChange={(next) => {
                  setView(next);
                  setMenuOpen(false);
                }}
              />
            </div>
          ) : null}
        </header>
        <main className="w-full px-4 py-5 lg:px-5">
          {toast ? (
            <div className="mb-4 rounded-md border border-[#ffc83d]/40 bg-[#271f0b] px-3 py-2 text-sm font-bold text-[#ffe49a]">
              {toast}
            </div>
          ) : null}
          {remoteError ? (
            <div className="mb-4 rounded-md border border-amber-400/40 bg-amber-950/40 px-3 py-2 text-sm text-amber-100" role="status">
              {remoteError}
            </div>
          ) : null}
          {view === "dashboard" ? (
            <Dashboard
              quotes={data.quotes}
              events={data.events}
              onCreate={createQuote}
            />
          ) : null}
          {view === "quotes" ? (
            editing ? (
              <QuoteEditor
                quote={editing}
                quotes={data.quotes}
                settings={data.settings}
                tab={quoteTab}
                onTab={setQuoteTab}
                onBack={() => setEditing(null)}
                onSave={(q) => {
                  saveQuote(q);
                  flash("Orçamento salvo.");
                }}
                onDelete={removeQuote}
              />
            ) : (
              <QuotesGrid
                quotes={data.quotes}
                onCreate={createQuote}
                onOpen={(q) => {
                  setEditing(q);
                  setQuoteTab("trip");
                }}
                onDelete={removeQuote}
              />
            )
          ) : null}
          {view === "issues" ? (
            <Issues
              quotes={data.quotes}
              clients={data.clients}
              suppliers={data.suppliers}
              settings={data.settings}
              onClientsChange={(clients) => setData((cur) => ({ ...cur, clients }))}
              onSuppliersChange={(suppliers) => setData((cur) => ({ ...cur, suppliers }))}
              onCreate={createIssue}
              onSave={(q) => {
                saveQuote({ ...q, isIssue: true });
                flash("Emissão salva localmente.");
              }}
              onDelete={removeQuote}
              initialSearch={issueClientFilter}
            />
          ) : null}
          {view === "clients" ? (
            <Clients
              clients={data.clients}
              quotes={data.quotes}
              onChange={(clients) => setData((cur) => ({ ...cur, clients }))}
              onOpenIssues={(clientName) => {
                setIssueClientFilter(clientName);
                setView("issues");
              }}
            />
          ) : null}
          {view === "finance" ? (
            <Finance totals={totals} quotes={data.quotes} />
          ) : null}
          {view === "calendar" ? (
            <Calendar
              quotes={data.quotes}
              clients={data.clients}
              events={data.events}
              onChange={(events) => setData((cur) => ({ ...cur, events }))}
            />
          ) : null}
          {view === "suppliers" ? (
            <Suppliers
              suppliers={data.suppliers}
              onChange={(suppliers) =>
                setData((cur) => ({ ...cur, suppliers }))
              }
            />
          ) : null}
          {view === "tutorials" ? <Tutorials /> : null}
          {view === "billing" ? <Billing /> : null}
          {view === "settings" ? (
            <Settings
              settings={data.settings}
              onSave={(settings) => {
                setData((cur) => ({ ...cur, settings }));
                flash("Configurações salvas.");
              }}
              onExport={exportBackup}
              onImport={importBackup}
              onReset={() => {
                if (confirm("Apagar dados locais e carregar exemplos?"))
                  setData(defaultData());
              }}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="brand-header border-b border-[#1c3148] p-4">
      <div className="flex items-center gap-3">
        <div className="brand-logo" aria-hidden="true">
          <img src="/rm-travel-hub-logo.png" alt="" />
        </div>
        <strong>RM Travel Hub</strong>
      </div>
    </div>
  );
}
function SharedQuotePage({ quote, settings }: SharedQuote) {
  const date = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "Data a confirmar";
  const outboundFlights = [quote.flightOut, ...(quote.flightOutSegments ?? [])].filter((flight) => flight.from || flight.to || flight.code);
  const returnFlights = [quote.flightBack, ...(quote.flightBackSegments ?? [])].filter((flight) => flight.from || flight.to || flight.code);
  const phone = settings.contactPhone.replace(/\D/g, "");
  const calendarDate = (value: string) => value.replaceAll("-", "");
  const calendarEnd = quote.endDate
    ? calendarDate(new Date(new Date(`${quote.endDate}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10))
    : calendarDate(quote.startDate);
  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Viagem para ${quote.destination || "destino"}`)}&dates=${calendarDate(quote.startDate)}/${calendarEnd}&location=${encodeURIComponent(quote.destination)}&details=${encodeURIComponent(`Orçamento: ${window.location.href}`)}`;
  const shareOnWhatsApp = () => {
    const period = `${date(quote.startDate)} a ${date(quote.endDate)}`;
    const price = quote.showValues ? ` Valor: ${money(quote.cashPrice)}.` : "";
    const message = `Olá! Confira meu orçamento de viagem para ${quote.destination || "o destino selecionado"}, de ${period}.${price}\n\n${window.location.href}`;
    window.open(`https://api.whatsapp.com/send/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };
  return (
    <main className="shared-page">
      <header className="shared-header">
        <div>{settings.logoDataUrl ? <img src={settings.logoDataUrl} alt="" /> : <span>RM</span>}<div><strong>{settings.companyName}</strong><small>Orçamento de viagem</small></div></div>
        <div><strong>{quote.client || "Sua viagem"}</strong><small>{date(quote.startDate)} - {date(quote.endDate)}</small></div>
      </header>
      <div className="shared-content">
        <section className="shared-hero">
          <div><small>Sua viagem para</small><h1>{quote.destination || "Destino especial"}</h1><p>{date(quote.startDate)} - {date(quote.endDate)}</p></div>
          <div><strong>Uma experiência feita para você</strong><p>Confira todos os detalhes preparados para sua viagem.</p></div>
        </section>
        <nav className="shared-actions">
          <button onClick={shareOnWhatsApp}>Compartilhar</button>
          <a href={calendarUrl} target="_blank" rel="noreferrer">Adicionar ao Google Agenda</a>
          {phone ? <a href={`tel:+55${phone}`}>Ligar para atendente</a> : null}
          {phone ? <a href={`https://wa.me/55${phone}`} target="_blank" rel="noreferrer">WhatsApp</a> : null}
          {settings.instagram ? <a href={`https://instagram.com/${settings.instagram.replace("@", "")}`} target="_blank" rel="noreferrer">Instagram</a> : null}
        </nav>
        {outboundFlights.length ? <section className="shared-section"><h2>✈ Voos</h2>{outboundFlights.map((flight, index) => <SharedFlight key={flight.segmentId ?? `out-${index}`} flight={flight} title={index ? `Viagem de ida · trecho ${index + 1}` : "Viagem de ida"} />)}{returnFlights.map((flight, index) => <SharedFlight key={flight.segmentId ?? `back-${index}`} flight={flight} title={index ? `Viagem de volta · trecho ${index + 1}` : "Viagem de volta"} />)}</section> : null}
        {quote.car.pickupAddress ? <section className="shared-section"><h2>Reservas de carro</h2><p><strong>Retirada:</strong> {quote.car.pickupAddress} em {date(quote.car.pickupDate)}</p><p><strong>Devolução:</strong> {quote.car.returnAddress} em {date(quote.car.returnDate)}</p><p>{quote.car.models}</p></section> : null}
        {quote.hotel.name ? <section className="shared-section"><h2>Hospedagem</h2><h3>{quote.hotel.name}</h3><p>{quote.hotel.address}</p><p>Check-in {date(quote.hotel.checkin)} · Check-out {date(quote.hotel.checkout)}</p></section> : null}
        {quote.showValues ? <section className="shared-section shared-price"><h2>Investimento</h2><strong>{money(quote.cashPrice)}</strong><p>{quote.installments} · {quote.paymentOption}</p></section> : null}
        <section className="shared-section"><h2>Seu atendente</h2><h3>{settings.contactName}</h3><p>{settings.contactEmail}</p><p>{settings.contactPhone}</p><p>{settings.companyName}</p></section>
        {quote.notes ? <section className="shared-section"><h2>Informações adicionais</h2><p className="shared-notes">{quote.notes}</p></section> : null}
        <section className="shared-cta"><h2>Pronto para confirmar sua viagem?</h2><p>Entre em contato com a nossa equipe para continuar.</p>{phone ? <a href={`https://wa.me/55${phone}`} target="_blank" rel="noreferrer">Entre em contato</a> : null}</section>
      </div>
      <footer className="shared-footer">{settings.companyName}</footer>
    </main>
  );
}
function SharedFlight({ flight, title }: { flight: Flight; title: string }) {
  const airport = (value: string) => value || "A confirmar";
  return (
    <article className="shared-flight">
      <div className="shared-flight-title"><strong>{title}</strong><span>{flight.airline || "Companhia a confirmar"} {flight.code}</span></div>
      <div className="shared-route"><div><strong>{flight.departTime || "--:--"}</strong><span>{airport(flight.from)}</span></div><i>✈</i><div><strong>{flight.arriveTime || "--:--"}</strong><span>{airport(flight.to)}</span></div></div>
      <div className="shared-details"><span>Passageiros <b>{flight.passengers.length}</b></span><span>Bagagem despachada <b>{flight.checkedBags} · {flight.checkedBagWeight || 0} kg</b></span><span>Bagagem de mão <b>{flight.carryOnBags} · {flight.carryOnWeight || 0} kg</b></span><span>Mochilas <b>{flight.backpacks}</b></span><span>Pets <b>{flight.pets}</b></span><span>Reembolsável <b>{flight.refundable ? "Sim" : "Não"}</b></span></div>
    </article>
  );
}
function Nav({
  current,
  onChange,
}: {
  current: ViewKey;
  onChange: (view: ViewKey) => void;
}) {
  return (
    <nav className="grid gap-1 p-3">
      {nav.map((item) => (
        <button
          key={item.key}
          className={`nav-item ${current === item.key ? "nav-active" : ""}`}
          onClick={() => onChange(item.key)}
        >
          <span>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
function Dashboard({
  quotes,
  events,
  onCreate,
}: {
  quotes: Quote[];
  events: CalendarEvent[];
  onCreate: () => void;
}) {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">("today");
  const now = new Date();
  const isDemoRecord = (quote: Quote) =>
    Boolean(quote.isDemo) ||
    quote.client === "Família Exemplo" ||
    quote.client === "Mariana Exemplo" ||
    quote.client === "Cliente Exemplo";
  const inPeriod = (value: string) => {
    if (!value) return false;
    const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    if (period === "today") return date.toDateString() === now.toDateString();
    if (period === "week") {
      const start = new Date(now);
      const mondayOffset = (now.getDay() + 6) % 7;
      start.setDate(now.getDate() - mondayOffset);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return date >= start && date < end;
    }
    if (period === "year") return date.getFullYear() === now.getFullYear();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  };
  const periodQuotes = quotes.filter((quote) => !isDemoRecord(quote) && !quote.isIssue && inPeriod(quote.createdAt));
  const issued = quotes.filter((quote) => !isDemoRecord(quote) && quote.isIssue && quote.status !== "cancelado" && inPeriod(quote.issue.saleDate || quote.createdAt));
  const sales = issued.reduce((sum, quote) => sum + quote.cashPrice, 0);
  const costs = issued.reduce((sum, quote) => sum + issueCost(quote), 0);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const upcomingFlights = quotes
    .filter((quote) => {
      if (isDemoRecord(quote) || !quote.isIssue || quote.status === "cancelado") return false;
      const departureDate = quote.flightOut.date || quote.startDate;
      if (!departureDate) return false;
      return new Date(`${departureDate}T${quote.flightOut.departTime || "00:00"}:00`).getTime() >= todayStart;
    })
    .sort((a, b) => `${a.flightOut.date || a.startDate}T${a.flightOut.departTime || "00:00"}`.localeCompare(`${b.flightOut.date || b.startDate}T${b.flightOut.departTime || "00:00"}`))
    .slice(0, 3);
  const upcomingEvents = events
    .filter((event) => !event.completed)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  return (
    <div className="grid gap-5">
      <section className="hero-strip">
        <div>
          <span className="hero-pill">Novo • RM Partiu CRM</span>
          <h1>A sua agência vai voar</h1>
          <p>
            Resumo operacional de orçamentos, emissões, próximos voos e eventos.
          </p>
        </div>
        <button className="gold-button" onClick={onCreate}>
          Conhecer o CRM →
        </button>
      </section>
      <div>
        <p className="text-[#9fc8ee]">RM Partiu Viagens</p>
        <h2 className="text-3xl font-black">Seu resumo</h2>
      </div>
      <Segment value={period} onChange={setPeriod} />
      <div className="metric-grid">
        <Metric title="Vendas" value={money(sales)} />
        <Metric title="Lucro" value={money(sales - costs)} />
        <Metric title="Despesas" value={money(costs)} />
        <Metric title="Orçamentos criados" value={String(periodQuotes.length)} />
        <Metric title="Emissões geradas" value={String(issued.length)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <Panel title="Seus próximos voos">
          {upcomingFlights.map((q) => (
            <TimelineItem
              key={q.id}
              icon="⌁"
              title={`Voo de ${q.client || "cliente não informado"} - ${flightRoute(q.flightOut, q.flightBack, q.route) || "rota não informada"}`}
              detail={`${q.flightOut.date || q.startDate} · ${q.destination || q.flightOut.to || "destino não informado"}`}
            />
          ))}
        </Panel>
        <Panel title="Seus próximos eventos">
          {upcomingEvents.map((event) => <TimelineItem key={event.id} icon="□" title={event.title} detail={`${event.date.split("-").reverse().join("/")} · ${event.description || "Sem descrição"}`} />)}
          {upcomingEvents.length === 0 ? <p className="text-[#9fc8ee]">Nenhum evento pendente.</p> : null}
        </Panel>
      </div>
    </div>
  );
}
function QuotesGrid({
  quotes,
  onCreate,
  onOpen,
  onDelete,
}: {
  quotes: Quote[];
  onCreate: () => void;
  onOpen: (q: Quote) => void;
  onDelete: (id: string) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ name: "", destination: "", client: "" });
  const visibleQuotes = quotes.filter(
    (quote) =>
      !quote.isIssue &&
      quote.name.toLowerCase().includes(filters.name.toLowerCase()) &&
      quote.destination.toLowerCase().includes(filters.destination.toLowerCase()) &&
      quote.client.toLowerCase().includes(filters.client.toLowerCase()),
  );
  const downloadQuote = (quote: Quote) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(quote, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `orcamento-${quote.destination.toLowerCase().replaceAll(" ", "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid gap-4">
      <Toolbar
        title="Orçamentos"
        action="Criar novo orçamento"
        onAction={onCreate}
      />
      <button className="filter-button" onClick={() => setFiltersOpen((open) => !open)}>⊕ Adicionar filtro</button>
      {filtersOpen ? (
        <Panel title="Filtros do orçamento">
          <div className="form-grid">
            <Field label="Nome do orçamento"><input className="input" placeholder="Filtrar por nome" value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} /></Field>
            <Field label="Destino"><input className="input" placeholder="Filtrar por destino" value={filters.destination} onChange={(e) => setFilters({ ...filters, destination: e.target.value })} /></Field>
            <Field label="Nome do cliente"><input className="input" placeholder="Filtrar por cliente" value={filters.client} onChange={(e) => setFilters({ ...filters, client: e.target.value })} /></Field>
          </div>
          <button className="dark-mini mt-3" onClick={() => setFilters({ name: "", destination: "", client: "" })}>Limpar filtros</button>
        </Panel>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleQuotes.map((q) => (
          <article key={q.id} className="quote-card">
            <div>
              <small>{q.name}</small>
              <h3>{q.destination}</h3>
              <p>{q.route}</p>
              <span>
                {statusText[q.status]} · {money(q.cashPrice)}
              </span>
            </div>
            <div className="flex justify-between">
              <button
                className="quote-delete"
                aria-label={`Excluir orçamento ${q.name}`}
                title="Excluir orçamento"
                onClick={() => onDelete(q.id)}
              >
                <TrashIcon />
              </button>
              <div className="flex gap-2">
                <button className="dark-mini" aria-label={`Baixar ${q.name}`} onClick={() => downloadQuote(q)}>⇩</button>
                <button className="light-mini" onClick={() => onOpen(q)}>
                  ◎
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
function QuoteEditor({
  quote,
  quotes,
  settings,
  tab,
  onTab,
  onBack,
  onSave,
  onDelete,
}: {
  quote: Quote;
  quotes: Quote[];
  settings: AppSettings;
  tab: QuoteTab;
  onTab: (tab: QuoteTab) => void;
  onBack: () => void;
  onSave: (quote: Quote) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState(quote);
  const [importSection, setImportSection] = useState<"cars" | "hotels" | "insurance" | null>(null);
  const tabs: Array<[QuoteTab, string]> = [
    ["trip", "Dados da viagem"],
    ["flights", "Voos"],
    ["cars", "Carros"],
    ["hotels", "Hospedagens"],
    ["insurance", "Seguro Viagem"],
  ];
  const importLabels = {
    cars: "carros",
    hotels: "hospedagens",
    insurance: "seguro viagem",
  } as const;
  const importSectionFromQuote = (source: Quote) => {
    if (!importSection) return;
    if (importSection === "cars") {
      setDraft({ ...draft, car: { ...source.car }, carOptions: (source.carOptions ?? []).map((item) => ({ ...item })) });
    } else if (importSection === "hotels") {
      setDraft({ ...draft, hotel: { ...source.hotel }, hotelOptions: (source.hotelOptions ?? []).map((item) => ({ ...item })) });
    } else {
      setDraft({ ...draft, insurance: { ...source.insurance }, insuranceOptions: (source.insuranceOptions ?? []).map((item) => ({ ...item })) });
    }
    setImportSection(null);
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1c3148] pb-3">
        <button className="nav-secondary" onClick={onBack}>
          ← Orçamentos
        </button>
        <input className="input mr-auto max-w-md text-xl font-semibold" aria-label="Nome do orçamento" placeholder="Novo orçamento" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <button className="quote-delete" aria-label="Excluir orçamento" title="Excluir orçamento" onClick={() => onDelete(draft.id)}>
          <TrashIcon />
        </button>
        <button className="dark-mini" onClick={() => window.open(shareUrl({ quote: draft, settings }), "_blank", "noopener,noreferrer")}>
          Compartilhar Beta
        </button>
        <button className="dark-mini" onClick={() => openQuotePdf(draft, settings)}>
          Ver PDF
        </button>
        <button className="light-mini" onClick={() => onSave(draft)}>
          Salvar
        </button>
      </div>
      <div className="tabs">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "tab-active" : ""}
            onClick={() => onTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "trip" ? <TripForm quote={draft} settings={settings} onChange={setDraft} /> : null}
      {tab === "flights" ? (
        <FlightsForm quote={draft} onChange={setDraft} />
      ) : null}
      {tab === "cars" ? <CarsForm quote={draft} onChange={setDraft} onImport={() => setImportSection("cars")} /> : null}
      {tab === "hotels" ? <HotelsForm quote={draft} onChange={setDraft} onImport={() => setImportSection("hotels")} /> : null}
      {tab === "insurance" ? (
        <InsuranceForm quote={draft} onChange={setDraft} onImport={() => setImportSection("insurance")} />
      ) : null}
      {importSection ? (
        <QuoteImportModal
          quotes={quotes.filter((item) => item.id !== draft.id && !item.isIssue)}
          onClose={() => setImportSection(null)}
          onImport={importSectionFromQuote}
          description={`Selecione um orçamento salvo para importar ${importLabels[importSection]}. Os demais dados deste orçamento serão preservados.`}
          confirmLabel={`Importar ${importLabels[importSection]}`}
        />
      ) : null}
    </div>
  );
}
function TripForm({
  quote,
  settings,
  onChange,
}: {
  quote: Quote;
  settings: AppSettings;
  onChange: (q: Quote) => void;
}) {
  const installmentOptions = settings.installmentRates.map(
    (rate, index) => `${index + 1}x - ${rate.toFixed(2).replace(".", ",")}%`,
  );
  const calculatedPayment = installmentPrice(quote.cashPrice, quote.installments);
  const calculation = installmentCalculation(quote.cashPrice, quote.installments);
  const updatePricing = (cashPrice: number, installments: string) =>
    onChange({
      ...quote,
      cashPrice,
      installments,
      paymentOption: installmentPrice(cashPrice, installments),
    });

  return (
    <div className="grid gap-4">
      <Panel title="Dados da viagem">
        <div className="trip-data-form">
          <Field label="Nome do cliente">
            <input
              className="input"
              placeholder="Opcional"
              value={quote.client}
              onChange={(e) => onChange({ ...quote, client: e.target.value })}
            />
            <small>Dê preferência para o primeiro nome do cliente</small>
          </Field>
          <Field label="Destino">
            <input
              className="input"
              placeholder="Informe o destino do orçamento"
              value={quote.destination}
              onChange={(e) =>
                onChange({ ...quote, destination: e.target.value })
              }
            />
            <small>Destino principal que será exibido no orçamento</small>
          </Field>
          <DateRangePicker
            helper="Selecione as datas de início e fim da viagem"
            start={quote.startDate}
            end={quote.endDate}
            onChange={(startDate, endDate) =>
              onChange({ ...quote, startDate, endDate })
            }
          />
          <div className="trip-values-control">
            <span>
              <b>Mostrar valores</b>
              <small>Exibir os valores dos itens no documento gerado</small>
            </span>
            <label className="switch" aria-label="Mostrar valores no documento">
              <input
                type="checkbox"
                checked={quote.showValues}
                onChange={(e) => onChange({ ...quote, showValues: e.target.checked })}
              />
              <span aria-hidden="true" />
            </label>
          </div>
          <div className="trip-pricing-grid">
            <Field label="Preço à vista">
              <CurrencyInput value={quote.cashPrice} onChange={(cashPrice) => updatePricing(cashPrice, quote.installments)} />
            </Field>
            <Field label="Quantidade máxima de parcelas">
              <select className="input" value={quote.installments} onChange={(e) => updatePricing(quote.cashPrice, e.target.value)}>
                <option value="">Selecione as parcelas</option>
                {installmentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Preço parcelado">
              <input className="input" placeholder="Selecione as parcelas" value={calculatedPayment} readOnly aria-readonly="true" />
              {calculation ? (
                <small>
                  {calculation.installments}x de {money(calculation.installmentValue)} ({calculation.rate.toFixed(2).replace(".", ",")}%)
                </small>
              ) : null}
            </Field>
          </div>
          <Field label="Informações adicionais" className="trip-notes-field">
            <textarea
              className="input trip-notes"
              placeholder="Adicione informações adicionais ao cliente"
              value={quote.notes}
              onChange={(e) => onChange({ ...quote, notes: e.target.value })}
            />
            <small>Opcional</small>
          </Field>
        </div>
      </Panel>
      <Panel title="QR Code">
        <div className="trip-values-control">
          <span><b>Mostrar QR Code</b><small>Adicionar um QR Code ao documento gerado</small></span>
          <label className="switch" aria-label="Mostrar QR Code">
            <input type="checkbox" checked={quote.qrCode} onChange={(e) => onChange({ ...quote, qrCode: e.target.checked })} />
            <span aria-hidden="true" />
          </label>
        </div>
      </Panel>
      {quote.qrCode ? (
        <Panel title="Conteúdo do QR Code">
          <div className="form-grid">
            <Field label="Conteúdo do QR Code">
              <input className="input" placeholder="Texto ou link a ser codificado" value={quote.qrContent} onChange={(e) => onChange({ ...quote, qrContent: e.target.value })} />
            </Field>
            <Field label="Legenda">
              <input className="input" placeholder="Subtítulo do QR Code" value={quote.qrCaption} onChange={(e) => onChange({ ...quote, qrCaption: e.target.value })} />
            </Field>
          </div>
          <div className="qr-box mt-4">QR</div>
          <p className="mt-2 text-sm text-[#9fc8ee]">{quote.qrCaption}</p>
        </Panel>
      ) : null}
    </div>
  );
}
function DateRangePicker({
  label = "Data da viagem",
  helper,
  start,
  end,
  onChange,
}: {
  label?: string;
  helper?: string;
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const initial = start ? new Date(`${start}T12:00:00`) : new Date();
  const [cursor, setCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const shortDate = (value: string) =>
    value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "";
  const select = (value: string) => {
    if (!start || end || value < start) onChange(value, "");
    else {
      onChange(start, value);
      setOpen(false);
    }
  };
  const month = (offset: number) => {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1);
    const firstDay = date.getDay();
    const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: 42 }, (_, index) => {
      const day = index - firstDay + 1;
      return day > 0 && day <= count ? day : null;
    });
    return (
      <div className="range-month" key={offset}>
        <strong>{date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</strong>
        <div className="range-weekdays">{["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="range-days">
          {days.map((day, index) => {
            if (!day) return <span key={`empty-${index}`} />;
            const value = iso(new Date(date.getFullYear(), date.getMonth(), day));
            const selected = value === start || value === end;
            const inRange = Boolean(start && end && value > start && value < end);
            return <button type="button" key={value} className={`${selected ? "range-selected" : ""} ${inRange ? "range-between" : ""}`} onClick={() => select(value)} aria-label={new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR")}>{day}</button>;
          })}
        </div>
      </div>
    );
  };
  return (
    <div className="date-range-field" ref={rootRef}>
      <label>{label}</label>
      <button type="button" className="input date-range-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span aria-hidden="true">□</span>
        {start ? `${shortDate(start)}${end ? ` – ${shortDate(end)}` : " – selecione a volta"}` : "Selecione ida e volta"}
      </button>
      {helper ? <small>{helper}</small> : null}
      {open ? (
        <div className="date-range-popover">
          <div className="range-navigation">
            <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Meses anteriores">‹</button>
            <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Próximos meses">›</button>
          </div>
          <div className="range-months">{month(0)}{month(1)}</div>
          <p>{!start || end ? "Selecione a data de ida" : "Agora selecione a data de volta"}</p>
        </div>
      ) : null}
    </div>
  );
}
function SingleDatePicker({ label, value, onChange, manual = false, helper }: { label: string; value: string; onChange: (value: string) => void; manual?: boolean; helper?: string }) {
  const selected = value ? new Date(`${value}T12:00:00`) : new Date();
  const [open, setOpen] = useState(false);
  const [typedDate, setTypedDate] = useState(value ? selected.toLocaleDateString("pt-BR") : "");
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => setTypedDate(value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : ""), [value]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const [cursor, setCursor] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
  const calendarMonth = (offset: number) => {
    const monthDate = new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1);
    const firstDay = monthDate.getDay();
    const count = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: 42 }, (_, index) => {
      const day = index - firstDay + 1;
      return day > 0 && day <= count ? day : null;
    });
    return (
      <div className="range-month" key={offset}>
        <strong>{monthDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</strong>
        <div className="range-weekdays">{["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="range-days">
          {days.map((day, index) => {
            if (!day) return <span key={`empty-${index}`} />;
            const isoDay = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            return <button type="button" key={isoDay} className={isoDay === value ? "range-selected" : ""} onClick={() => { onChange(isoDay); setOpen(false); }}>{day}</button>;
          })}
        </div>
      </div>
    );
  };
  return (
    <div className={`single-date-field ${manual ? "manual-date-field" : ""} ${open ? "date-open" : ""}`} ref={rootRef}>
      <label>{label}</label>
      {manual ? <div className="manual-date-control">
        <input className="input" inputMode="numeric" placeholder="DD/MM/AAAA" value={typedDate} onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
          const masked = digits.length > 4 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}` : digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
          setTypedDate(masked);
          if (!digits) onChange("");
          if (digits.length === 8) {
            const day = Number(digits.slice(0, 2)); const month = Number(digits.slice(2, 4)); const year = Number(digits.slice(4));
            const parsed = new Date(year, month - 1, day);
            if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) onChange(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
          }
        }} />
        <button type="button" onClick={() => setOpen((current) => !current)} aria-label="Abrir calendário" aria-expanded={open}>□</button>
       </div> : <button type="button" className="input date-range-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
          <span aria-hidden="true">□</span>
          {value ? selected.toLocaleDateString("pt-BR") : "Selecione uma data"}
        </button>}
      {helper ? <small>{helper}</small> : null}
      {open ? <div className="date-range-popover single-date-popover standardized-date-popover">
        <div className="range-navigation">
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Meses anteriores">‹</button>
          <button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Próximos meses">›</button>
        </div>
        <div className="range-months">{calendarMonth(0)}{calendarMonth(1)}</div>
        <p>Selecione uma data</p>
      </div> : null}
    </div>
  );
}
function FlightsForm({
  quote,
  onChange,
}: {
  quote: Quote;
  onChange: (q: Quote) => void;
}) {
  const [showReturn, setShowReturn] = useState(() => Boolean(quote.flightBack.code || quote.flightBack.from || quote.flightBack.to || quote.flightBack.date || quote.flightBackSegments?.length));
  return (
    <div className="flight-booking">
      <div className="flight-booking-bar">
        <div><span aria-hidden="true">✈</span><strong>Reservas de voo</strong></div>
        <div>
          <button className="dark-mini" type="button" onClick={() => { onChange({ ...quote, flightBack: emptyFlight() }); setShowReturn(true); }}>＋ Nova viagem de volta</button>
          <button className="dark-mini" type="button" title="Importação disponível em Emissões">⇩ Importar</button>
        </div>
      </div>
      <CompactFlightBlock
        title="Viagem de ida"
        flight={quote.flightOut}
        onChange={(flightOut) => onChange({ ...quote, flightOut })}
        segments={quote.flightOutSegments ?? []}
        onSegmentsChange={(flightOutSegments) => onChange({ ...quote, flightOutSegments })}
      />
      {showReturn ? <CompactFlightBlock title="Viagem de volta" flight={quote.flightBack} onChange={(flightBack) => onChange({ ...quote, flightBack })} segments={quote.flightBackSegments ?? []} onSegmentsChange={(flightBackSegments) => onChange({ ...quote, flightBackSegments })} onRemove={() => { onChange({ ...quote, flightBack: emptyFlight(), flightBackSegments: [] }); setShowReturn(false); }} /> : null}
    </div>
  );
}
function CompactFlightBlock({ title, flight, onChange, segments, onSegmentsChange, onRemove, showSummary = true }: { title: string; flight: Flight; onChange: (flight: Flight) => void; segments: Flight[]; onSegmentsChange: (segments: Flight[]) => void; onRemove?: () => void; showSummary?: boolean }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const changePassengers = (passengers: Passenger[]) => onChange(syncPassengerBaggage({ ...flight, passengers }));
  const searchAirline = () => {
    const prefix = flight.code.trim().toUpperCase().slice(0, 2);
    const airlines: Record<string, string> = { AD: "Azul", G3: "GOL", LA: "LATAM", IB: "Iberia", TP: "TAP" };
    onChange({ ...flight, airline: airlines[prefix] || flight.airline });
  };
  return (
    <section className="compact-flight-panel">
      <div className="compact-flight-heading">
        <h2><span aria-hidden="true">✈</span> {title}</h2>
        {onRemove ? <button type="button" className="flight-trash" onClick={onRemove} aria-label={`Remover ${title}`} title="Remover viagem"><TrashIcon /></button> : null}
      </div>
      <div className="compact-flight-layout">
        <div className="compact-flight-main">
          <div className="compact-flight-fields">
            <Field label="Código do voo"><input className="input" placeholder="IATA (ex.: AD4191)" value={flight.code} onChange={(e) => onChange({ ...flight, code: e.target.value.toUpperCase() })} /></Field>
            <SingleDatePicker label="Data de partida" value={flight.date} onChange={(date) => onChange({ ...flight, date })} />
          </div>
          <div className="compact-flight-actions">
            <button className="light-mini" type="button" onClick={searchAirline}>⌕ Pesquisar</button>
            <button className="light-mini" type="button" onClick={() => setDetailsOpen((value) => !value)}>＋ Adicionar</button>
          </div>
          {detailsOpen ? <div className="flight-extra-fields">
            <Field label="Companhia"><AirlinePicker value={flight.airline} onChange={(airline) => onChange({ ...flight, airline })} /></Field>
            <Field label="Classe do voo"><select className="input" value={flight.cabinClass ?? "Econômica"} onChange={(e) => onChange({ ...flight, cabinClass: e.target.value })}><option>Primeira Classe</option><option>Executiva</option><option>Econômica Premium</option><option>Econômica</option></select></Field>
            <Field label="Origem"><AirportInput value={flight.from} onChange={(from) => onChange({ ...flight, from })} /></Field>
            <Field label="Destino"><AirportInput value={flight.to} onChange={(to) => onChange({ ...flight, to })} /></Field>
            <Field label="Partida"><TimeInput value={flight.departTime} onChange={(departTime) => onChange({ ...flight, departTime })} /></Field>
            <Field label="Chegada"><TimeInput value={flight.arriveTime} onChange={(arriveTime) => onChange({ ...flight, arriveTime })} /></Field>
          </div> : null}
          {showSummary && (flight.code || flight.from || flight.to || flight.airline) ? <FlightSummaryCard flight={flight} /> : null}
          <div className="flight-segments">
            {segments.map((segment, index) => <FlightSegmentCard key={segment.segmentId ?? index} segment={segment} index={index + 2} onChange={(next) => onSegmentsChange(segments.map((item, itemIndex) => itemIndex === index ? next : item))} onRemove={() => onSegmentsChange(segments.filter((_, itemIndex) => itemIndex !== index))} />)}
            <button className="light-mini add-flight-segment" type="button" onClick={() => onSegmentsChange([...segments, { ...emptyFlight(), segmentId: uid() }])}>＋ Adicionar trecho</button>
          </div>
        </div>
        <div className="compact-passenger-panel">
          <div className="compact-passenger-list">
            {flight.passengers.map((passenger, index) => <div className="compact-passenger" key={passenger.id}>
              <div className="compact-passenger-heading">
                <small>Passageiro {index + 1}</small>
                {index > 0 ? <button type="button" aria-label={`Remover passageiro ${index + 1}`} title="Remover passageiro" onClick={() => changePassengers(flight.passengers.filter((item) => item.id !== passenger.id))}><TrashIcon /></button> : null}
              </div>
              <label><span>Sobrenome</span><input className="compact-passenger-name" aria-label={`Sobrenome do passageiro ${index + 1}`} placeholder="Ex.: Macena" value={passenger.surname} onChange={(e) => changePassengers(flight.passengers.map((item) => item.id === passenger.id ? { ...item, surname: e.target.value } : item))} /></label>
              <label><span>Nome</span><input className="compact-passenger-name compact-passenger-first" aria-label={`Nome do passageiro ${index + 1}`} placeholder="Ex.: Ronaldo" value={passenger.name} onChange={(e) => changePassengers(flight.passengers.map((item) => item.id === passenger.id ? { ...item, name: e.target.value } : item))} /></label>
              <div className="passenger-counts">
                <Stepper label="Despachadas" value={passenger.checkedBags} onChange={(checkedBags) => changePassengers(flight.passengers.map((item) => item.id === passenger.id ? { ...item, checkedBags } : item))} />
                <Stepper label="Mão" value={passenger.carryOnBags} onChange={(carryOnBags) => changePassengers(flight.passengers.map((item) => item.id === passenger.id ? { ...item, carryOnBags } : item))} />
                <Stepper label="Mochilas" value={passenger.backpacks} onChange={(backpacks) => changePassengers(flight.passengers.map((item) => item.id === passenger.id ? { ...item, backpacks } : item))} />
              </div>
            </div>)}
          </div>
          <button className="light-mini add-passenger" type="button" onClick={() => changePassengers([...flight.passengers, defaultPassenger()])}>＋ Adicionar passageiro</button>
          <div className="compact-baggage">
            <Field label="Bagagens despachadas até"><input className="input" type="number" placeholder="23 kg" value={flight.checkedBagWeight || ""} onChange={(e) => onChange({ ...flight, checkedBagWeight: Number(e.target.value) })} /></Field>
            <Field label="Bagagens de mão até"><input className="input" type="number" placeholder="10 kg" value={flight.carryOnWeight || ""} onChange={(e) => onChange({ ...flight, carryOnWeight: Number(e.target.value) })} /></Field>
            <Stepper label="Pets" value={flight.pets} onChange={(pets) => onChange({ ...flight, pets })} />
            <label className="toggle-row"><input type="checkbox" checked={flight.refundable} onChange={(e) => onChange({ ...flight, refundable: e.target.checked })} /> Reembolsável</label>
          </div>
        </div>
      </div>
    </section>
  );
}
function FlightSummaryCard({ flight }: { flight: Flight }) {
  const airlineKey = flight.airline.toLowerCase();
  const logo = airlineKey.includes("latam") ? "/airlines/latam.svg" : airlineKey.includes("gol") ? "/airlines/gol.svg" : airlineKey.includes("azul") ? "/airlines/azul.svg" : "";
  const durationLabel = (() => {
    if (!flight.departTime || !flight.arriveTime) return "";
    const [startHour, startMinute] = flight.departTime.split(":").map(Number);
    const [endHour, endMinute] = flight.arriveTime.split(":").map(Number);
    let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
    if (minutes < 0) minutes += 1440;
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}min`;
  })();
  return <article className="flight-result-card">
    <div className="flight-result-meta"><span>Voo <strong>{flight.code || "A confirmar"}</strong></span><strong>{flight.cabinClass || "Econômica"}</strong>{logo ? <img src={logo} alt={flight.airline} /> : <strong>{flight.airline || "Companhia aérea"}</strong>}</div>
    <div className="flight-result-route">
      <div><small>Saindo</small><strong>{flight.departTime || "--:--"}<em> GMT-3</em></strong><span>✈ {flight.from || "Origem a confirmar"}</span><span>▣ {flight.date ? new Date(`${flight.date}T12:00:00`).toLocaleDateString("pt-BR") : "Selecione uma data"}</span></div>
      <div><small>Chegada</small><strong>{flight.arriveTime || "--:--"}{durationLabel ? <em> ({durationLabel})</em> : null}</strong><span>✈ {flight.to || "Destino a confirmar"}</span><span>▣ {flight.date ? new Date(`${flight.date}T12:00:00`).toLocaleDateString("pt-BR") : "Selecione uma data"}</span></div>
    </div>
  </article>;
}
const flightAirlines = ["Azul", "GOL", "LATAM", "KLM", "Aerolineas Argentinas", "Air China", "Royal Air Maroc", "Iberia", "TAP"];
function AirlinePicker({ value, onChange }: { value: string; onChange: (airline: string) => void }) {
  const [customMode, setCustomMode] = useState(() => Boolean(value && !flightAirlines.includes(value)));
  return <div className="airline-picker-field">
    <select className="input" value={customMode ? "__custom__" : value} onChange={(event) => {
      if (event.target.value === "__custom__") { setCustomMode(true); onChange(""); }
      else { setCustomMode(false); onChange(event.target.value); }
    }}>
      <option value="">Selecione uma companhia</option>
      {flightAirlines.map((airline) => <option key={airline} value={airline}>{airline}</option>)}
      <option value="__custom__">Outra companhia...</option>
    </select>
    {customMode ? <input className="input" placeholder="Digite o nome da companhia" value={value} onChange={(event) => onChange(event.target.value)} autoFocus /> : null}
  </div>;
}
function FlightSegmentCard({ segment, index, onChange, onRemove }: { segment: Flight; index: number; onChange: (flight: Flight) => void; onRemove: () => void }) {
  return <article className="flight-segment-card">
    <div className="flight-segment-heading"><strong>Trecho {index}</strong><button type="button" className="flight-trash" onClick={onRemove} aria-label={`Remover trecho ${index}`} title="Remover trecho"><TrashIcon /></button></div>
    <div className="flight-segment-grid">
      <Field label="Código do voo"><input className="input" placeholder="IATA (ex.: AD4191)" value={segment.code} onChange={(e) => onChange({ ...segment, code: e.target.value.toUpperCase() })} /></Field>
      <SingleDatePicker label="Data de partida" value={segment.date} onChange={(date) => onChange({ ...segment, date })} />
      <Field label="Classe do voo"><select className="input" value={segment.cabinClass ?? "Econômica"} onChange={(e) => onChange({ ...segment, cabinClass: e.target.value })}><option>Primeira Classe</option><option>Executiva</option><option>Econômica Premium</option><option>Econômica</option></select></Field>
      <Field label="Companhia aérea"><AirlinePicker value={segment.airline} onChange={(airline) => onChange({ ...segment, airline })} /></Field>
      <Field label="Saindo"><AirportInput value={segment.from} onChange={(from) => onChange({ ...segment, from })} /></Field>
      <Field label="Chegada"><AirportInput value={segment.to} onChange={(to) => onChange({ ...segment, to })} /></Field>
      <Field label="Partida"><TimeInput value={segment.departTime} onChange={(departTime) => onChange({ ...segment, departTime })} /></Field>
      <Field label="Chegada"><TimeInput value={segment.arriveTime} onChange={(arriveTime) => onChange({ ...segment, arriveTime })} /></Field>
    </div>
  </article>;
}
function FlightBlock({
  title,
  flight,
  onChange,
}: {
  title: string;
  flight: Flight;
  onChange: (flight: Flight) => void;
}) {
  const changePassengers = (passengers: Passenger[]) => onChange(syncPassengerBaggage({ ...flight, passengers }));
  return (
    <Panel title={title}>
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="form-grid">
          <Field label="Código do voo">
            <input
              className="input"
              placeholder="Ex.: LA3576"
              value={flight.code}
              onChange={(e) => onChange({ ...flight, code: e.target.value })}
            />
          </Field>
          <Field label="Companhia">
            <input
              className="input"
              placeholder="Ex.: LATAM"
              value={flight.airline}
              onChange={(e) => onChange({ ...flight, airline: e.target.value })}
            />
          </Field>
          <Field label="Saindo">
            <AirportInput value={flight.from} onChange={(from) => onChange({ ...flight, from })} />
          </Field>
          <Field label="Chegada">
            <AirportInput value={flight.to} onChange={(to) => onChange({ ...flight, to })} />
          </Field>
          <Field label="Partida">
            <TimeInput value={flight.departTime} onChange={(departTime) => onChange({ ...flight, departTime })} />
          </Field>
          <Field label="Chegada">
            <TimeInput value={flight.arriveTime} onChange={(arriveTime) => onChange({ ...flight, arriveTime })} />
          </Field>
          <div className="flight-search-actions">
            <button className="light-mini" type="button" onClick={() => {
              const prefix = flight.code.trim().toUpperCase().slice(0, 2);
              const airlines: Record<string, string> = { AD: "Azul", G3: "GOL", LA: "LATAM", IB: "Iberia", TP: "TAP" };
              onChange({ ...flight, airline: airlines[prefix] || flight.airline });
            }}>
              Pesquisar
            </button>
          </div>
        </div>
        <div className="passenger-box grid gap-3">
          {flight.passengers.map((passenger, index) => (
            <div key={passenger.id} className="grid gap-2 border-b border-[#1c3148] pb-3">
              <div className="flex items-center justify-between"><strong>Passageiro {index + 1}</strong>{flight.passengers.length > 1 ? <button className="danger-mini" type="button" onClick={() => changePassengers(flight.passengers.filter((item) => item.id !== passenger.id))}>Remover</button> : null}</div>
              <div className="grid grid-cols-2 gap-2">
                <input aria-label={`Nome do passageiro ${index + 1}`} className="input" placeholder="Nome" value={passenger.name} onChange={(e) => onChange({ ...flight, passengers: flight.passengers.map((item) => item.id === passenger.id ? { ...item, name: e.target.value } : item) })} />
                <input aria-label={`Sobrenome do passageiro ${index + 1}`} className="input" placeholder="Sobrenome" value={passenger.surname} onChange={(e) => onChange({ ...flight, passengers: flight.passengers.map((item) => item.id === passenger.id ? { ...item, surname: e.target.value } : item) })} />
              </div>
              <input aria-label={`E-ticket do passageiro ${index + 1}`} className="input" placeholder="E-ticket (opcional)" value={passenger.ticket} onChange={(e) => onChange({ ...flight, passengers: flight.passengers.map((item) => item.id === passenger.id ? { ...item, ticket: e.target.value } : item) })} />
              <div className="grid grid-cols-3 gap-2">
                <Stepper label="Despachadas" value={passenger.checkedBags} onChange={(checkedBags) => changePassengers(flight.passengers.map((item) => item.id === passenger.id ? { ...item, checkedBags } : item))} />
                <Stepper label="Mão" value={passenger.carryOnBags} onChange={(carryOnBags) => changePassengers(flight.passengers.map((item) => item.id === passenger.id ? { ...item, carryOnBags } : item))} />
                <Stepper label="Mochilas" value={passenger.backpacks} onChange={(backpacks) => changePassengers(flight.passengers.map((item) => item.id === passenger.id ? { ...item, backpacks } : item))} />
              </div>
            </div>
          ))}
          <button className="dark-mini" type="button" onClick={() => changePassengers([...flight.passengers, defaultPassenger()])}>＋ Adicionar passageiro</button>
          <div className="grid grid-cols-2 gap-2">
            <Stepper label="Pets" value={flight.pets} onChange={(pets) => onChange({ ...flight, pets })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Despachada até (kg)"><input className="input" type="number" placeholder="Ex.: 23" value={flight.checkedBagWeight || ""} onChange={(e) => onChange({ ...flight, checkedBagWeight: Number(e.target.value) })} /></Field>
            <Field label="Mão até (kg)"><input className="input" type="number" placeholder="Ex.: 10" value={flight.carryOnWeight || ""} onChange={(e) => onChange({ ...flight, carryOnWeight: Number(e.target.value) })} /></Field>
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={flight.refundable}
              onChange={(e) =>
                onChange({ ...flight, refundable: e.target.checked })
              }
            />{" "}
            Reembolsável
          </label>
        </div>
      </div>
      <FlightTicket flight={flight} />
    </Panel>
  );
}
function CarsForm({
  quote,
  onChange,
  onImport,
}: {
  quote: Quote;
  onChange: (q: Quote) => void;
  onImport?: () => void;
}) {
  const [addressMode, setAddressMode] = useState<"pickup" | "return" | null>(
    null,
  );
  const car = quote.car;
  const saveAddress = (value: string) => {
    onChange({
      ...quote,
      car: {
        ...car,
        [addressMode === "pickup" ? "pickupAddress" : "returnAddress"]: value,
      },
    });
    setAddressMode(null);
  };
  return (
    <SectionBand icon="▱" title="Reservas de carro" action="Novo aluguel de carro" onAdd={() => onChange({ ...quote, carOptions: [...(quote.carOptions ?? []), blankQuote().car] })} onImport={onImport}>
      <Panel title="Locação 1">
        <div className="car-rental-form">
          <div className="car-field-wide"><DateRangePicker label="Datas da locação" start={car.pickupDate} end={car.returnDate} onChange={(pickupDate, returnDate) => onChange({ ...quote, car: { ...car, pickupDate, returnDate } })} /></div>
          <Field label="Horário de retirada">
            <TimeInput value={car.pickupTime} onChange={(pickupTime) => onChange({ ...quote, car: { ...car, pickupTime } })} />
          </Field>
          <Field label="Horário de devolução">
            <TimeInput value={car.returnTime} onChange={(returnTime) => onChange({ ...quote, car: { ...car, returnTime } })} />
          </Field>
          <Field label="Local de retirada">
            <button className="address-button" onClick={() => setAddressMode("pickup")}>{car.pickupAddress || "Adicionar endereço"} ✎</button>
          </Field>
          <Field label="Local de devolução">
            <button className="address-button" onClick={() => setAddressMode("return")}>{car.returnAddress || "Adicionar endereço"} ✎</button>
          </Field>
          <label className="car-switch-row"><span>Devolver o carro no mesmo endereço</span><span className="switch"><input type="checkbox" checked={car.sameLocation} onChange={(e) => onChange({ ...quote, car: { ...car, sameLocation: e.target.checked, returnAddress: e.target.checked ? car.pickupAddress : car.returnAddress } })} /><span /></span></label>
          <label className="car-switch-row"><span>Reembolsável</span><span className="switch"><input type="checkbox" checked={car.refundable} onChange={(e) => onChange({ ...quote, car: { ...car, refundable: e.target.checked } })} /><span /></span></label>
          <div className="car-field-wide"><Field label="Modelos">
            <input
              className="input"
              placeholder="Digite os modelos separados por vírgula"
              value={car.models}
              onChange={(e) =>
                onChange({ ...quote, car: { ...car, models: e.target.value } })
              }
            />
            <small>Informe o nome dos modelos separados por vírgula</small>
          </Field></div>
        </div>
        <div className="car-feature-grid">
          <CarFeatureCard icon="❉" active={car.airConditioning} label={car.airConditioning ? "Com ar condicionado" : "Sem ar condicionado"} onClick={() => onChange({ ...quote, car: { ...car, airConditioning: !car.airConditioning } })} />
          <CarFeatureCard icon="◇" active={car.airbag} label={car.airbag ? "Com airbag" : "Sem airbag"} onClick={() => onChange({ ...quote, car: { ...car, airbag: !car.airbag } })} />
          <CarFeatureCard icon="♙" active label={`${car.passengers || 1} passageiros`} onClick={() => onChange({ ...quote, car: { ...car, passengers: (car.passengers || 1) >= 9 ? 1 : (car.passengers || 1) + 1 } })} />
          <CarFeatureCard icon="▥" active label={`${car.doors || 1} portas`} onClick={() => onChange({ ...quote, car: { ...car, doors: (car.doors || 1) >= 5 ? 1 : (car.doors || 1) + 1 } })} />
          <CarFeatureCard icon="⚙" active={car.powerSteering} label={car.powerSteering ? "Direção elétrica" : "Direção manual"} onClick={() => onChange({ ...quote, car: { ...car, powerSteering: !car.powerSteering } })} />
          <CarFeatureCard icon="≋" active={car.automatic} label={car.automatic ? "Transmissão automática" : "Transmissão manual"} onClick={() => onChange({ ...quote, car: { ...car, automatic: !car.automatic } })} />
          <CarFeatureCard icon="◔" active={car.abs} label={car.abs ? "Com freio ABS" : "Sem freio ABS"} onClick={() => onChange({ ...quote, car: { ...car, abs: !car.abs } })} />
          <CarFeatureCard icon="▤" active={car.electricWindows} label={car.electricWindows ? "Vidros elétricos" : "Vidros manuais"} onClick={() => onChange({ ...quote, car: { ...car, electricWindows: !car.electricWindows } })} />
          <CarFeatureCard icon="♙" active={car.electricLocks} label={car.electricLocks ? "Trava elétrica" : "Trava manual"} onClick={() => onChange({ ...quote, car: { ...car, electricLocks: !car.electricLocks } })} />
        </div>
      </Panel>
      {(quote.carOptions ?? []).map((option, index) => <Panel key={index} title={`Locação ${index + 2}`}>
        <div className="form-grid">
          <DateRangePicker label="Período da locação" start={option.pickupDate} end={option.returnDate} onChange={(pickupDate, returnDate) => { const carOptions = [...(quote.carOptions ?? [])]; carOptions[index] = { ...option, pickupDate, returnDate }; onChange({ ...quote, carOptions }); }} />
          <Field label="Modelos"><input className="input" placeholder="Ex.: Econômico ou SUV compacto" value={option.models} onChange={(e) => { const carOptions = [...(quote.carOptions ?? [])]; carOptions[index] = { ...option, models: e.target.value }; onChange({ ...quote, carOptions }); }} /></Field>
          <Field label="Horário de retirada"><TimeInput value={option.pickupTime} onChange={(pickupTime) => { const carOptions = [...(quote.carOptions ?? [])]; carOptions[index] = { ...option, pickupTime }; onChange({ ...quote, carOptions }); }} /></Field>
          <Field label="Horário de devolução"><TimeInput value={option.returnTime} onChange={(returnTime) => { const carOptions = [...(quote.carOptions ?? [])]; carOptions[index] = { ...option, returnTime }; onChange({ ...quote, carOptions }); }} /></Field>
          <button className="danger-mini" type="button" onClick={() => onChange({ ...quote, carOptions: (quote.carOptions ?? []).filter((_, itemIndex) => itemIndex !== index) })}>Excluir opção</button>
        </div>
      </Panel>)}
      {addressMode ? (
        <AddressModal
          initial={
            addressMode === "pickup" ? car.pickupAddress : car.returnAddress
          }
          onClose={() => setAddressMode(null)}
          onSave={saveAddress}
        />
      ) : null}
    </SectionBand>
  );
}
function HotelsForm({
  quote,
  onChange,
  onImport,
}: {
  quote: Quote;
  onChange: (q: Quote) => void;
  onImport?: () => void;
}) {
  const h = quote.hotel;
  const [addressOpen, setAddressOpen] = useState(false);
  return (
    <SectionBand
      icon="▥"
      title="Reservas de hospedagem"
      action="Nova hospedagem"
      onAdd={() => onChange({ ...quote, hotelOptions: [...(quote.hotelOptions ?? []), blankQuote().hotel] })}
      onImport={onImport}
    >
      <Panel title="Hospedagem 1">
        <div className="form-grid">
          <Field label="Hotel">
            <input
              className="input"
              placeholder="Ex.: Hotel Beira Mar"
              value={h.name}
              onChange={(e) =>
                onChange({ ...quote, hotel: { ...h, name: e.target.value } })
              }
            />
          </Field>
          <Field label="Endereço">
            <button className="address-button" type="button" onClick={() => setAddressOpen(true)}>{h.address || "Adicionar endereço"} ✎</button>
          </Field>
          <DateRangePicker label="Período da hospedagem" start={h.checkin} end={h.checkout} onChange={(checkin, checkout) => onChange({ ...quote, hotel: { ...h, checkin, checkout } })} />
          <Field label="Horário de check-in">
            <TimeInput value={h.checkinTime} onChange={(checkinTime) => onChange({ ...quote, hotel: { ...h, checkinTime } })} />
          </Field>
          <Field label="Horário de check-out">
            <TimeInput value={h.checkoutTime} onChange={(checkoutTime) => onChange({ ...quote, hotel: { ...h, checkoutTime } })} />
          </Field>
          <Stepper
            label="Quartos"
            value={h.rooms}
            onChange={(rooms) => onChange({ ...quote, hotel: { ...h, rooms } })}
          />
          <Stepper
            label="Hóspedes"
            value={h.guests}
            onChange={(guests) =>
              onChange({ ...quote, hotel: { ...h, guests } })
            }
          />
          <label className="toggle-row">
            <input type="checkbox" checked={h.refundable} onChange={(e) => onChange({ ...quote, hotel: { ...h, refundable: e.target.checked } })} /> Reembolsável
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={h.breakfast} onChange={(e) => onChange({ ...quote, hotel: { ...h, breakfast: e.target.checked } })} /> Café da manhã incluso
          </label>
        </div>
      </Panel>
      {(quote.hotelOptions ?? []).map((option, index) => <Panel key={index} title={`Hospedagem ${index + 2}`}>
        <div className="form-grid">
          <Field label="Hotel"><input className="input" placeholder="Ex.: Hotel Beira Mar" value={option.name} onChange={(e) => { const hotelOptions = [...(quote.hotelOptions ?? [])]; hotelOptions[index] = { ...option, name: e.target.value }; onChange({ ...quote, hotelOptions }); }} /></Field>
          <DateRangePicker label="Período da hospedagem" start={option.checkin} end={option.checkout} onChange={(checkin, checkout) => { const hotelOptions = [...(quote.hotelOptions ?? [])]; hotelOptions[index] = { ...option, checkin, checkout }; onChange({ ...quote, hotelOptions }); }} />
          <Stepper label="Quartos" value={option.rooms} onChange={(rooms) => { const hotelOptions = [...(quote.hotelOptions ?? [])]; hotelOptions[index] = { ...option, rooms }; onChange({ ...quote, hotelOptions }); }} />
          <Stepper label="Hóspedes" value={option.guests} onChange={(guests) => { const hotelOptions = [...(quote.hotelOptions ?? [])]; hotelOptions[index] = { ...option, guests }; onChange({ ...quote, hotelOptions }); }} />
          <button className="danger-mini" type="button" onClick={() => onChange({ ...quote, hotelOptions: (quote.hotelOptions ?? []).filter((_, itemIndex) => itemIndex !== index) })}>Excluir opção</button>
        </div>
      </Panel>)}
      {addressOpen ? <AddressModal initial={h.address} onClose={() => setAddressOpen(false)} onSave={(address) => { onChange({ ...quote, hotel: { ...h, address } }); setAddressOpen(false); }} /> : null}
    </SectionBand>
  );
}
function InsuranceForm({
  quote,
  onChange,
  onImport,
}: {
  quote: Quote;
  onChange: (q: Quote) => void;
  onImport?: () => void;
}) {
  const s = quote.insurance;
  const [expanded, setExpanded] = useState(true);
  const reservationText = (insurance: InsuranceReservation) => insurance.description !== undefined ? insurance.description : [
    insurance.provider ? `Fornecedor: ${insurance.provider}` : "",
    insurance.plan ? `Plano: ${insurance.plan}` : "",
    insurance.travelers ? `Viajantes: ${insurance.travelers}` : "",
    insurance.price ? `Valor: ${money(insurance.price)}` : "",
  ].filter(Boolean).join("\n");
  const insuranceText = [
    reservationText(s),
    ...(quote.insuranceOptions ?? []).map((option, index) => {
      const content = reservationText(option);
      return content ? `Seguro ${index + 2}\n${content}` : "";
    }),
  ].filter(Boolean).join("\n\n");
  return (
    <section className="insurance-note-section">
      <div className="insurance-note-header">
        <button className="insurance-note-toggle" type="button" aria-expanded={expanded} aria-controls="quote-insurance-content" onClick={() => setExpanded((value) => !value)}>
          <ShieldIcon />
          <strong>Seguro Viagem</strong>
        </button>
        <div className="insurance-note-actions">
          {onImport ? <button className="dark-mini" type="button" onClick={onImport}>⇩ Importar</button> : null}
          <button className="insurance-chevron" type="button" aria-label={expanded ? "Recolher Seguro Viagem" : "Expandir Seguro Viagem"} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
            <ChevronIcon expanded={expanded} />
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="insurance-note-content" id="quote-insurance-content">
          <label htmlFor="quote-insurance-description">Seguro Viagem</label>
          <textarea
            id="quote-insurance-description"
            className="insurance-note-textarea"
            rows={8}
            placeholder="Descreva as informações a serem incluídas no Seguro Viagem"
            value={insuranceText}
            onChange={(event) => onChange({
              ...quote,
              insurance: { ...s, description: event.target.value },
              insuranceOptions: [],
            })}
          />
          <small>Opcional</small>
        </div>
      ) : null}
    </section>
  );
}
function Issues({
  quotes,
  clients,
  suppliers,
  settings,
  onClientsChange,
  onSuppliersChange,
  onCreate,
  onSave,
  onDelete,
  initialSearch = "",
}: {
  quotes: Quote[];
  clients: Client[];
  suppliers: Supplier[];
  settings: AppSettings;
  onClientsChange: (clients: Client[]) => void;
  onSuppliersChange: (suppliers: Supplier[]) => void;
  onCreate: () => Quote;
  onSave: (q: Quote) => void;
  onDelete: (id: string) => void;
  initialSearch?: string;
}) {
  const [editingIssue, setEditingIssue] = useState<Quote | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ locator: "", airline: "", client: "", passenger: "" });
  const rows = quotes.filter(
    (q) =>
      q.isIssue &&
      (q.status === "emitido" || q.status === "aguardando") &&
      `${q.client} ${q.route} ${q.destination}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      q.issue.locator.toLowerCase().includes(filters.locator.toLowerCase()) &&
      q.flightOut.airline.toLowerCase().includes(filters.airline.toLowerCase()) &&
      q.client.toLowerCase().includes(filters.client.toLowerCase()) &&
      q.flightOut.passengers.some((passenger) => `${passenger.name} ${passenger.surname}`.toLowerCase().includes(filters.passenger.toLowerCase())),
  );
  const issueNumber = (id: string) =>
    String(
      Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 49000),
    ).slice(-5);
  const dateTime = (date: string, time: string) =>
    date
      ? `${new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        })}, ${time || "--:--"}`
      : "Não informado";
  const checkinState = (date: string, time: string) => {
    if (!date) return "Fechado";
    const departure = new Date(`${date}T${time || "23:59"}:00`);
    return !Number.isNaN(departure.getTime()) && departure.getTime() < Date.now()
      ? "Encerrado"
      : "Fechado";
  };
  const downloadIssue = (q: Quote) => {
    const blob = new Blob([JSON.stringify(q, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `emissao-${issueNumber(q.id)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  if (editingIssue)
    return (
      <IssueEditor
        issue={editingIssue}
        clients={clients}
        suppliers={suppliers}
        settings={settings}
        onClientsChange={onClientsChange}
        onSuppliersChange={onSuppliersChange}
        availableQuotes={quotes.filter((quote) => !quote.isIssue)}
        onChange={setEditingIssue}
        onBack={() => setEditingIssue(null)}
        onSave={() => {
          const savedIssue = {
            ...editingIssue,
            name: editingIssue.name.trim() || issueDefaultName(editingIssue),
          };
          onSave(savedIssue);
          setEditingIssue(null);
        }}
        onDelete={() => {
          onDelete(editingIssue.id);
          setEditingIssue(null);
        }}
      />
    );
  return (
    <div className="grid gap-4">
      <div className="issues-list-toolbar">
        <button
          className="light-mini"
          onClick={() => setEditingIssue(onCreate())}
        >
          Criar nova emissão
        </button>
        <div className="issues-view-controls" aria-label="Modo de visualização">
          <button className="view-toggle view-toggle-active" aria-label="Visualização em tabela" title="Tabela">▦</button>
          <button className="view-toggle" aria-label="Visualização em cartões" title="Cartões">□</button>
        </div>
      </div>
      <button className="filter-button issues-filter-button" onClick={() => setFiltersOpen((open) => !open)}>⊕ Adicionar filtro</button>
      {filtersOpen ? (
        <Panel title="Filtros da emissão">
          <div className="form-grid">
            <Field label="Localizador"><input className="input" placeholder="Filtrar por localizador" value={filters.locator} onChange={(e) => setFilters({ ...filters, locator: e.target.value })} /></Field>
            <Field label="Companhia aérea"><input className="input" placeholder="Filtrar por companhia" value={filters.airline} onChange={(e) => setFilters({ ...filters, airline: e.target.value })} /></Field>
            <Field label="Nome do cliente"><input className="input" placeholder="Filtrar por cliente" value={filters.client} onChange={(e) => setFilters({ ...filters, client: e.target.value })} /></Field>
            <Field label="Nome do passageiro"><input className="input" placeholder="Filtrar por passageiro" value={filters.passenger} onChange={(e) => setFilters({ ...filters, passenger: e.target.value })} /></Field>
          </div>
          <button className="dark-mini mt-3" onClick={() => setFilters({ locator: "", airline: "", client: "", passenger: "" })}>Limpar filtros</button>
        </Panel>
      ) : null}
      {rows.length ? (
        <div className="issues-table table-wrap">
          <table>
            <thead>
              <tr>
                <th># <span aria-hidden="true">↕</span></th>
                <th>Companhia <span aria-hidden="true">↕</span></th>
                <th>Localizador</th>
                <th>Sobrenome <span aria-hidden="true">↕</span></th>
                <th>Rota <span aria-hidden="true">↕</span></th>
                <th>Check-in <span aria-hidden="true">↕</span></th>
                <th>Data de embarque <span aria-hidden="true">↕</span></th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const automaticRoute = flightRoute(q.flightOut, q.flightBack, q.route);
                const routes = automaticRoute
                  .split("→")
                  .map((part) => part.trim())
                  .filter(Boolean);
                const company =
                  q.issueType === "flight"
                    ? q.flightOut.airline || q.issue.provider || "Aérea"
                    : q.issueType === "car"
                      ? "Carro"
                      : "Hotel";
                const airlineLogo =
                  q.issueType === "flight"
                    ? ({ latam: "latam", azul: "azul", gol: "gol" } as const)[
                        company.toLowerCase() as "latam" | "azul" | "gol"
                      ]
                    : undefined;
                return (
                  <tr key={q.id}>
                    <td>
                      <strong>{issueNumber(q.id)}</strong>
                    </td>
                    <td>
                      <span
                        className={`company-pill company-${company.toLowerCase().replaceAll(" ", "-")}`}
                      >
                        {airlineLogo ? (
                          <img src={`/airlines/${airlineLogo}.svg`} alt={company} />
                        ) : company}
                      </span>
                    </td>
                    <td>
                      <strong>{q.issue.locator || "Não informado"}</strong>
                    </td>
                    <td>
                      <strong title={q.client}>{q.client}</strong>
                    </td>
                    <td>
                      <div className="route-pills">
                        <span>{routes.slice(0, 2).join(" → ") || automaticRoute}</span>
                        {routes.length > 2 ? (
                          <span>{routes.slice(1).join(" → ")}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="checkin-pills">
                        <span>
                          {checkinState(
                            q.flightOut.date || q.startDate,
                            q.flightOut.departTime,
                          )}
                        </span>
                        {q.flightBack.date || q.endDate ? (
                          <span>
                            {checkinState(
                              q.flightBack.date || q.endDate,
                              q.flightBack.departTime,
                            )}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="date-pills">
                        <span>
                          {dateTime(
                            q.flightOut.date || q.startDate,
                            q.flightOut.departTime,
                          )}
                        </span>
                        {q.endDate ? (
                          <span>
                            {dateTime(
                              q.flightBack.date || q.endDate,
                              q.flightBack.departTime,
                            )}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="issue-actions">
                        <button
                          aria-label={`Abrir emissão de ${q.client}`}
                          onClick={() => setEditingIssue(q)}
                        >
                          ◉
                        </button>
                        <button
                          aria-label={`Baixar emissão de ${q.client}`}
                          onClick={() => downloadIssue(q)}
                        >
                          ⇩
                        </button>
                        <button
                          aria-label={`Mais opções de ${q.client}`}
                          onClick={() => setEditingIssue(q)}
                        >
                          •••
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <h2>Nenhuma emissão encontrada</h2>
          <p>Crie uma emissão ou altere o tipo selecionado.</p>
          <button
            className="gold-button"
            onClick={() => setEditingIssue(onCreate())}
          >
            Nova emissão
          </button>
        </div>
      )}
    </div>
  );
}

function IssueEditor({
  issue,
  clients,
  suppliers,
  settings,
  onClientsChange,
  onSuppliersChange,
  availableQuotes,
  onChange,
  onBack,
  onSave,
  onDelete,
}: {
  issue: Quote;
  clients: Client[];
  suppliers: Supplier[];
  settings: AppSettings;
  onClientsChange: (clients: Client[]) => void;
  onSuppliersChange: (suppliers: Supplier[]) => void;
  availableQuotes: Quote[];
  onChange: (q: Quote) => void;
  onBack: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<"details" | "reservation" | "options">(
    "details",
  );
  const [importOpen, setImportOpen] = useState(false);
  const [quoteImportOpen, setQuoteImportOpen] = useState(false);
  const [clientOptionsOpen, setClientOptionsOpen] = useState(false);
  const [loyaltyOptionsOpen, setLoyaltyOptionsOpen] = useState(false);
  const [loyaltyQuery, setLoyaltyQuery] = useState("");
  const [supplierOptionsOpen, setSupplierOptionsOpen] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [newSupplierName, setNewSupplierName] = useState<string | null>(null);
  const [newClient, setNewClient] = useState<Client | null>(null);
  const milesCost = (issue.issue.pointsAmount / 1000) * issue.issue.thousandCost + issue.issue.fees;
  const emissionCost = issue.issue.method === "miles" ? milesCost : issue.cost;
  const profit = issue.cashPrice - emissionCost;
  const updateIssue = (next: Partial<IssueDetails>) =>
    onChange({ ...issue, issue: { ...issue.issue, ...next } });
  const updateMiles = (next: Partial<IssueDetails>) => {
    const details = { ...issue.issue, ...next };
    const cost = (details.pointsAmount / 1000) * details.thousandCost + details.fees;
    onChange({ ...issue, cost, issue: details });
  };
  const loyaltySearch = loyaltyQuery.trim().toLocaleLowerCase("pt-BR");
  const loyaltyMatches = loyaltyPrograms.filter((program) =>
    program.toLocaleLowerCase("pt-BR").includes(loyaltySearch),
  );
  const normalizedSupplierQuery = supplierQuery.trim().toLocaleLowerCase("pt-BR");
  const supplierMatches = suppliers.filter((supplier) =>
    `${supplier.name} ${supplier.type} ${supplier.contact}`
      .toLocaleLowerCase("pt-BR")
      .includes(normalizedSupplierQuery),
  );
  const hasExactSupplier = suppliers.some(
    (supplier) => supplier.name.toLocaleLowerCase("pt-BR") === normalizedSupplierQuery,
  );
  const save = () => onSave();
  return (
    <div className="issue-editor grid gap-4">
      <div className="editor-heading">
        <button className="nav-secondary" onClick={onBack}>
          ← Emissões
        </button>
        <input
          className="issue-title-input"
          aria-label="Nome da emissão"
          value={issue.name}
          onChange={(event) => onChange({ ...issue, name: event.target.value })}
          placeholder="Nome da emissão"
        />
        <div className="editor-actions">
          {issue.client !== "Novo cliente" ? (
            <button className="danger-mini" onClick={onDelete}>
              Excluir
            </button>
          ) : null}
          <button className="dark-mini" onClick={() => openIssuePdf(issue, settings)}>
            Ver PDF
          </button>
          <button className="light-mini" onClick={save}>
            Salvar
          </button>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <button
          className={tab === "details" ? "tab-active" : ""}
          onClick={() => setTab("details")}
        >
          Dados da emissão
        </button>
        <button
          className={tab === "reservation" ? "tab-active" : ""}
          onClick={() => setTab("reservation")}
        >
          Dados da reserva
        </button>
        <button
          className={tab === "options" ? "tab-active" : ""}
          onClick={() => setTab("options")}
        >
          Opções
        </button>
      </div>
      {tab === "details" ? (
        <div className="grid gap-4">
          <Panel title="Localizador">
            <div className="panel-action">
              <span>Dados de identificação da reserva</span>
              {issue.issueType === "flight" ? (
                <button
                  className="light-mini"
                  onClick={() => setImportOpen(true)}
                >
                  Importar emissão aérea
                </button>
              ) : null}
            </div>
            <div className="form-grid issue-locator-grid">
              <Field label="Localizador">
                <input
                  className="input"
                  value={issue.issue.locator}
                  onChange={(e) =>
                    updateIssue({ locator: e.target.value.toUpperCase() })
                  }
                  placeholder="Ex.: LA9576593UAPY"
                />
              </Field>
              <Field label="Link do localizador">
                <input
                  className="input"
                  type="url"
                  value={issue.issue.locatorLink}
                  onChange={(e) => updateIssue({ locatorLink: e.target.value })}
                  placeholder="https://..."
                />
              </Field>
            </div>
          </Panel>
          <Panel title="Venda">
            <div className="form-grid issue-sale-grid">
              <Field label="Cliente">
                <div className="client-combobox">
                  <input
                    className="input"
                    placeholder="Selecione ou digite o cliente"
                    value={issue.client}
                    onFocus={() => setClientOptionsOpen(true)}
                    onBlur={() => setClientOptionsOpen(false)}
                    onChange={(event) => { onChange({ ...issue, client: event.target.value }); setClientOptionsOpen(true); }}
                  />
                  {clientOptionsOpen && issue.client.trim() ? (
                    <div className="client-options">
                      {clients.filter((client) => client.name.toLowerCase().includes(issue.client.toLowerCase())).slice(0, 6).map((client) => (
                        <button key={client.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange({ ...issue, client: client.name }); setClientOptionsOpen(false); }}>
                          <strong>{client.name}</strong><small>{client.document || client.email || "Cliente cadastrado"}</small>
                        </button>
                      ))}
                      {!clients.some((client) => client.name.toLowerCase() === issue.client.trim().toLowerCase()) ? (
                        <button className="create-client-option" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
                          setClientOptionsOpen(false);
                          setNewClient({ id: uid(), name: issue.client.trim(), surname: "", phone: "", email: "", birthday: "", document: "", passport: "", origin: "Emissão", createdAt: new Date().toISOString() });
                        }}>
                          <span className="create-client-icon" aria-hidden="true">+</span>
                          <span><strong>Cadastrar novo cliente</strong><small>Adicionar “{issue.client.trim()}” ao cadastro</small></span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <small>Selecione o cliente que adquiriu a emissão</small>
              </Field>
              <Field label="Valor de venda">
                <CurrencyInput
                  value={issue.cashPrice}
                  onChange={(cashPrice) => onChange({ ...issue, cashPrice })}
                />
                <small>Informe o valor vendido ao cliente</small>
              </Field>
              <SingleDatePicker
                label="Data da venda"
                value={issue.issue.saleDate}
                onChange={(saleDate) => updateIssue({ saleDate })}
                helper="Informe a data em que a venda foi realizada"
              />
            </div>
          </Panel>
          <Panel title="Método de emissão">
            <div className="method-grid">
              {(
                [
                  ["miles", "Emissão com milhas"],
                  ["money", "Emissão com dinheiro"],
                  ["consolidator", "Emissão consolidadora"],
                  ["concierge", "Emissão concierge"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={
                    issue.issue.method === value
                      ? "method-active"
                      : "method-option"
                  }
                  onClick={() => updateIssue({ method: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={`form-grid issue-method-fields mt-4 ${issue.issue.method === "money" ? "issue-money-fields" : issue.issue.method === "consolidator" ? "issue-consolidator-fields" : ""}`}>
              <Field
                label={
                  issue.issue.method === "miles"
                    ? "Programa de fidelidade"
                    : issue.issue.method === "money"
                      ? "Site"
                    : issue.issue.method === "consolidator"
                      ? "Consolidadora"
                    : "Fornecedor"
                }
              >
                {issue.issue.method === "miles" ? (
                  <div
                    className="supplier-picker"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setLoyaltyOptionsOpen(false);
                      }
                    }}
                  >
                    <div className="supplier-picker-trigger">
                      <input
                        className="input"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={loyaltyOptionsOpen}
                      aria-controls="loyalty-program-options"
                      value={issue.issue.provider}
                      onFocus={() => {
                        setLoyaltyQuery(issue.issue.provider);
                        setLoyaltyOptionsOpen(true);
                      }}
                      onChange={(event) => {
                        const value = event.target.value;
                        updateIssue({ provider: value });
                        setLoyaltyQuery(value);
                        setLoyaltyOptionsOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setLoyaltyOptionsOpen(false);
                      }}
                        placeholder="Selecione ou insira o nome"
                      />
                      <button
                        type="button"
                        aria-label="Mostrar programas de fidelidade"
                        aria-expanded={loyaltyOptionsOpen}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setLoyaltyQuery("");
                          setLoyaltyOptionsOpen((open) => !open);
                        }}
                      >
                        ▾
                      </button>
                    </div>
                    {loyaltyOptionsOpen ? (
                      <div className="supplier-picker-menu">
                        <div className="supplier-picker-options" id="loyalty-program-options" role="listbox">
                        {loyaltyMatches.length ? loyaltyMatches.map((program) => (
                          <button
                            key={program}
                            type="button"
                            role="option"
                            aria-selected={issue.issue.provider === program}
                            onClick={() => {
                              updateIssue({ provider: program });
                              setLoyaltyQuery("");
                              setLoyaltyOptionsOpen(false);
                            }}
                          >
                            {program}
                          </button>
                        )) : (
                          <button
                            type="button"
                            className="loyalty-custom-option"
                            onClick={() => {
                              updateIssue({ provider: loyaltyQuery.trim() });
                              setLoyaltyOptionsOpen(false);
                            }}
                          >
                            Usar “{loyaltyQuery.trim()}”
                          </button>
                        )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <input
                    className="input"
                    value={issue.issue.provider}
                    onChange={(e) => updateIssue({ provider: e.target.value })}
                    placeholder={
                      issue.issue.method === "money"
                        ? "Site em que foi comprado"
                        : issue.issue.method === "consolidator"
                          ? "Nome da consolidadora"
                          : "Informe o fornecedor"
                    }
                  />
                )}
                {issue.issue.method === "miles" ? (
                  <small>Selecione o programa de pontos utilizado na emissão</small>
                ) : issue.issue.method === "money" ? (
                  <small>Informe o local ou site em que as emissões foram feitas</small>
                ) : issue.issue.method === "consolidator" ? (
                  <small>Informe a empresa que consolidou a compra ou serviço</small>
                ) : (
                  <small>Informe o fornecedor utilizado na emissão</small>
                )}
              </Field>
              {issue.issue.method === "miles" ? (
                <>
                  <Field label="Fornecedor">
                    <div
                      className="supplier-picker"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setSupplierOptionsOpen(false);
                        }
                      }}
                    >
                      <div className="supplier-picker-trigger">
                        <input
                          className="input"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded={supplierOptionsOpen}
                          aria-controls="miles-supplier-options"
                          value={supplierOptionsOpen ? supplierQuery : issue.issue.milesSupplier}
                          onFocus={() => {
                            setSupplierQuery(issue.issue.milesSupplier);
                            setSupplierOptionsOpen(true);
                          }}
                          onChange={(event) => {
                            setSupplierQuery(event.target.value);
                            setSupplierOptionsOpen(true);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setSupplierOptionsOpen(false);
                          }}
                          placeholder="Selecione o fornecedor"
                        />
                        <button
                          type="button"
                          aria-label="Mostrar fornecedores"
                          aria-expanded={supplierOptionsOpen}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setSupplierQuery("");
                            setSupplierOptionsOpen((open) => !open);
                          }}
                        >
                          ▾
                        </button>
                      </div>
                      {supplierOptionsOpen ? (
                        <div className="supplier-picker-menu">
                          <div className="supplier-picker-options" id="miles-supplier-options" role="listbox">
                            {supplierMatches.map((supplier) => (
                            <button
                              key={supplier.id}
                              type="button"
                              role="option"
                              aria-selected={issue.issue.milesSupplier === supplier.name}
                              onClick={() => {
                                updateMiles({ milesSupplier: supplier.name });
                                setSupplierQuery(supplier.name);
                                setSupplierOptionsOpen(false);
                              }}
                            >
                              <strong>{supplier.name}</strong>
                              <small>{supplier.type || supplier.contact || "Fornecedor cadastrado"}</small>
                            </button>
                            ))}
                            {supplierQuery.trim() && !hasExactSupplier ? (
                            <button
                              type="button"
                              className="supplier-picker-create"
                              onClick={() => {
                                setNewSupplierName(supplierQuery.trim());
                                setSupplierOptionsOpen(false);
                              }}
                            >
                              ＋ Cadastrar novo fornecedor “{supplierQuery.trim()}”
                            </button>
                            ) : null}
                            {!supplierMatches.length && !supplierQuery.trim() ? (
                              <span className="supplier-picker-empty">Nenhum fornecedor cadastrado. Digite um nome para cadastrar.</span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <small>Selecione o fornecedor das milhas</small>
                  </Field>
                  <div className="miles-cost-grid">
                    <Field label="Pontos">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="1000"
                        value={issue.issue.pointsAmount || ""}
                        onChange={(event) => updateMiles({ pointsAmount: Math.max(0, Number(event.target.value)) })}
                        placeholder="10000"
                      />
                      <small>Quantidade de pontos gastos</small>
                    </Field>
                    <Field label="Custo do milheiro">
                      <CurrencyInput
                        value={issue.issue.thousandCost}
                        onChange={(thousandCost) => updateMiles({ thousandCost })}
                      />
                      <small>Custo de cada 1000 pontos comprados</small>
                    </Field>
                    <Field label="Taxas">
                      <CurrencyInput
                        value={issue.issue.fees}
                        onChange={(fees) => updateMiles({ fees })}
                      />
                      <small>Gastos com taxas aeroportuárias</small>
                    </Field>
                  </div>
                </>
              ) : (
                <Field label="Valor">
                  <CurrencyInput
                    value={issue.cost}
                    onChange={(cost) => onChange({ ...issue, cost })}
                  />
                  <small>Valor pago na compra da emissão</small>
                </Field>
              )}
            </div>
            <div className={`issue-profit ${profit < 0 ? "issue-profit-negative" : ""}`}>
              <div>
                <strong>↗ Lucro</strong>
                <span>{money(profit)}</span>
              </div>
              <small>Valor da venda {money(issue.cashPrice)} − custo da emissão {money(emissionCost)}</small>
            </div>
          </Panel>
          <Panel title="Observações">
            <textarea
              className="input min-h-32"
              value={issue.issue.extraNotes}
              onChange={(e) => updateIssue({ extraNotes: e.target.value })}
              placeholder="Adicione informações extras"
            />
          </Panel>
        </div>
      ) : null}
      {tab === "reservation" ? (
        <div className="grid gap-4">
          <div>
            <strong className="issue-service-label">Tipo de emissão</strong>
            <div className="issue-service-grid">
              {(
                [
                  ["flight", "Passagem aérea"],
                  ["car", "Aluguel de carro"],
                  ["hotel", "Hospedagem"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={
                    issue.issueType === value
                      ? "issue-service-active"
                      : "issue-service-option"
                  }
                  onClick={() => onChange({ ...issue, issueType: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <small className="issue-help">
              Cada emissão pode ter apenas um tipo de serviço emitido
            </small>
          </div>
          {issue.issueType === "flight" ? (
            <SectionBand icon="✈" title="Emissões de voo" action="Nova viagem" onImport={() => setQuoteImportOpen(true)}>
              <CompactFlightBlock
                title="Viagem de ida"
                flight={issue.flightOut}
                onChange={(flightOut) => onChange({
                  ...issue,
                  flightOut,
                  route: flightRoute(flightOut, issue.flightBack),
                })}
                segments={issue.flightOutSegments ?? []}
                onSegmentsChange={(flightOutSegments) => onChange({ ...issue, flightOutSegments })}
                showSummary={false}
              />
              <CompactFlightBlock
                title="Viagem de volta"
                flight={issue.flightBack}
                onChange={(flightBack) => onChange({
                  ...issue,
                  flightBack,
                  route: flightRoute(issue.flightOut, flightBack),
                })}
                segments={issue.flightBackSegments ?? []}
                onSegmentsChange={(flightBackSegments) => onChange({ ...issue, flightBackSegments })}
                showSummary={false}
              />
            </SectionBand>
          ) : issue.issueType === "car" ? (
            <CarsForm quote={issue} onChange={onChange} />
          ) : (
            <HotelsForm quote={issue} onChange={onChange} />
          )}
        </div>
      ) : null}
      {tab === "options" ? (
        <Panel title="Configuração do PDF">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={issue.issue.showLogo}
              onChange={(e) => updateIssue({ showLogo: e.target.checked })}
            />{" "}
            Mostrar logo e dados da RM Partiu Viagens
          </label>
          <div className="document-preview mt-4">
            {issue.issue.showLogo ? (
              <div className="document-preview-brand">
                {settings.logoDataUrl ? (
                  <img src={settings.logoDataUrl} alt={`Logo de ${settings.companyName || "RM Partiu Viagens"}`} />
                ) : (
                  <span className="document-preview-logo-fallback">RM</span>
                )}
                <strong>{settings.companyName || "RM Partiu Viagens"}</strong>
              </div>
            ) : null}
            <h3>{issue.destination}</h3>
            <p>
              {issue.client} · {flightRoute(issue.flightOut, issue.flightBack, issue.route)}
            </p>
            <p>Localizador: {issue.issue.locator || "Não informado"}</p>
            <p className="document-price">{money(issue.cashPrice)}</p>
          </div>
        </Panel>
      ) : null}
      {importOpen ? (
        <IssueImportModal
          onClose={() => setImportOpen(false)}
          onImport={(airline, locator, surname) => {
            updateIssue({
              locator,
              provider: airline,
              extraNotes: `Importação local simulada para ${surname}. Confira os dados antes de salvar.`,
            });
            setImportOpen(false);
          }}
        />
      ) : null}
      {quoteImportOpen ? (
        <QuoteImportModal
          quotes={availableQuotes}
          onClose={() => setQuoteImportOpen(false)}
          onImport={(quote) => {
            onChange({
              ...issue,
              client: quote.client,
              destination: quote.destination,
              route: quote.route,
              startDate: quote.startDate,
              endDate: quote.endDate,
              cashPrice: quote.cashPrice,
              flightOut: normalizeFlight(quote.flightOut),
              flightBack: normalizeFlight(quote.flightBack),
            });
            setQuoteImportOpen(false);
          }}
        />
      ) : null}
      {newClient ? (
        <ClientModal
          client={newClient}
          quotes={availableQuotes}
          initialTab="registration"
          onClose={() => setNewClient(null)}
          onDelete={() => setNewClient(null)}
          onSave={(client) => {
            onClientsChange([client, ...clients]);
            onChange({ ...issue, client: client.name });
            setNewClient(null);
          }}
        />
      ) : null}
      {newSupplierName ? (
        <SupplierModal
          newRecord
          initial={{
            id: uid(),
            name: newSupplierName,
            type: "Milhas",
            contact: "",
            notes: "",
            phone: "",
            document: "",
            counter: "",
            createdAt: new Date().toISOString(),
          }}
          onClose={() => setNewSupplierName(null)}
          onSave={(supplier) => {
            onSuppliersChange([supplier, ...suppliers]);
            updateMiles({ milesSupplier: supplier.name });
            setSupplierQuery(supplier.name);
            setNewSupplierName(null);
          }}
        />
      ) : null}
    </div>
  );
}

function QuoteImportModal({
  quotes,
  onClose,
  onImport,
  description = "Selecione um orçamento para preencher a passagem aérea.",
  confirmLabel = "Importar orçamento",
}: {
  quotes: Quote[];
  onClose: () => void;
  onImport: (quote: Quote) => void;
  description?: string;
  confirmLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const filtered = quotes.filter((quote) => `${quote.name} ${quote.client} ${quote.destination} ${quote.route}`.toLowerCase().includes(search.toLowerCase()));
  const selectedQuote = quotes.find((quote) => quote.id === selectedId);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card quote-import-modal">
        <div className="flex items-center justify-between gap-3">
          <div><h2>Importar orçamento</h2><p className="text-sm text-[#9fc8ee]">{description}</p></div>
          <button className="danger-mini" onClick={onClose}>Fechar</button>
        </div>
        <input className="input mt-4" aria-label="Buscar orçamentos" placeholder="Buscar por cliente, destino ou rota" value={search} onChange={(event) => setSearch(event.target.value)} autoFocus />
        <div className="quote-import-list">
          {filtered.length ? filtered.map((quote) => (
            <button key={quote.id} type="button" className={selectedId === quote.id ? "quote-import-selected" : ""} aria-pressed={selectedId === quote.id} onClick={() => setSelectedId(quote.id)}>
              <span><strong>{quote.name || "Orçamento sem nome"}</strong><small>{quote.client || "Cliente não informado"}</small></span>
              <span><b>{quote.destination || "Destino não informado"}</b><small>{quote.route || "Rota não informada"}</small></span>
            </button>
          )) : <div className="empty-state"><strong>Nenhum orçamento disponível</strong><p>Crie e salve um orçamento antes de importar.</p></div>}
        </div>
        <div className="quote-import-footer">
          <span>{selectedQuote ? `Selecionado: ${selectedQuote.name || selectedQuote.client}` : "Selecione um orçamento acima"}</span>
          <button className="light-mini" type="button" disabled={!selectedQuote} onClick={() => selectedQuote && onImport(selectedQuote)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function IssueImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (airline: string, locator: string, surname: string) => void;
}) {
  const [airline, setAirline] = useState("LATAM");
  const [locator, setLocator] = useState("");
  const [surname, setSurname] = useState("");
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="flex items-center justify-between">
          <div>
            <h2>Importe sua emissão</h2>
            <p className="text-sm text-[#9fc8ee]">
              Use o código da reserva para preencher a emissão localmente.
            </p>
          </div>
          <button className="danger-mini" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div
          className="airline-grid"
          role="radiogroup"
          aria-label="Companhia aérea"
        >
          {["Azul", "GOL", "LATAM", "Iberia"].map((name) => (
            <button
              key={name}
              className={airline === name ? "airline-active" : "airline-option"}
              onClick={() => setAirline(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="form-grid mt-4">
          <Field label="Localizador">
            <input
              className="input"
              value={locator}
              onChange={(e) => setLocator(e.target.value.toUpperCase())}
              placeholder="Código da reserva"
            />
          </Field>
          <Field label="Sobrenome">
            <input
              className="input"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              placeholder="Sobrenome do passageiro"
            />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="dark-mini" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="light-mini"
            disabled={!locator.trim() || !surname.trim()}
            onClick={() => onImport(airline, locator, surname)}
          >
            Buscar emissão
          </button>
        </div>
      </div>
    </div>
  );
}
function Clients({
  clients,
  quotes,
  onChange,
  onOpenIssues,
}: {
  clients: Client[];
  quotes: Quote[];
  onChange: (clients: Client[]) => void;
  onOpenIssues: (clientName: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [initialTab, setInitialTab] = useState<ClientTab>("data");
  const [cards, setCards] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const names = (client: Client) => {
    const parts = client.name.trim().split(/\s+/).filter(Boolean);
    return {
      first: parts[0] || "Sem nome",
      last: client.surname || parts.slice(1).join(" ") || "Não definido",
    };
  };
  const rows = Array.from(
    new Map(clients.map((client) => [client.id, client])).values(),
  ).filter((client) =>
    `${client.name} ${client.document} ${client.email} ${client.phone}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const openNew = () => {
    setInitialTab("registration");
    setSelected({
      id: uid(),
      name: "",
      phone: "",
      email: "",
      birthday: "",
      document: "",
      passport: "",
      origin: "Manual",
      createdAt: new Date().toISOString(),
    });
  };
  const save = (client: Client) => {
    onChange(
      clients.some((item) => item.id === client.id)
        ? clients.map((item) => (item.id === client.id ? client : item))
        : [client, ...clients],
    );
    setSelected(null);
  };
  const remove = (client: Client) => {
    if (!confirm(`Excluir ${client.name || "este cliente"}?`)) return;
    onChange(clients.filter((item) => item.id !== client.id));
    setSelected(null);
  };
  const exportClients = () => {
    const body = clients.map((client) => {
      const n = names(client);
      return [n.first, n.last, client.document, client.email, client.phone]
        .map((value) => `"${String(value || "").replaceAll('"', '""')}"`)
        .join(",");
    });
    const url = URL.createObjectURL(
      new Blob(
        [["Nome,Sobrenome,CPF/CNPJ,Email,Telefone", ...body].join("\n")],
        { type: "text/csv" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "clientes-rm-partiu.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="client-page">
      <div className="supplier-toolbar">
        <input
          className="input supplier-search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Pesquise pelo nome, CPF/CNPJ, email ou celular"
          aria-label="Pesquisar clientes"
        />
        <div className="supplier-actions">
          <button className="client-action client-action-primary" onClick={openNew}>
            <PlusIcon />
            <span>Novo cliente</span>
          </button>
          <button
            className="client-action client-action-secondary"
            onClick={exportClients}
            disabled={!clients.length}
            title={!clients.length ? "Nenhum cliente para exportar" : "Exportar clientes em CSV"}
          >
            <DownloadIcon />
            <span>Exportar</span>
          </button>
          <button
            className={`icon-button ${!cards ? "view-active" : ""}`}
            onClick={() => setCards(false)}
            title="Tabela"
          >
            ▦
          </button>
          <button
            className={`icon-button ${cards ? "view-active" : ""}`}
            onClick={() => setCards(true)}
            title="Cartões"
          >
            □
          </button>
        </div>
      </div>
      {cards ? (
        <div className="client-cards">
          {pageRows.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              names={names(client)}
              onView={() => {
                setInitialTab("data");
                setSelected(client);
              }}
              onIssues={() => onOpenIssues(client.name)}
            />
          ))}
        </div>
      ) : (
        <div className="client-table table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome　↕</th>
                <th>Sobrenome　↕</th>
                <th>CPF/CNPJ　↕</th>
                <th>Email　↕</th>
                <th>Telefone　↕</th>
                <th>Criado em</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((client) => {
                const n = names(client);
                return (
                  <tr key={client.id}>
                    <td>
                      <strong>{n.first}</strong>
                    </td>
                    <td>
                      <strong>{n.last}</strong>
                    </td>
                    <td>{client.document || "Não definido"}</td>
                    <td>{client.email || "Não definido"}</td>
                    <td>{client.phone || "Não definido"}</td>
                    <td>
                      {client.createdAt
                        ? new Date(client.createdAt).toLocaleDateString("pt-BR")
                        : "Há algumas semanas"}
                    </td>
                    <td>
                      <div className="client-row-actions">
                        <button
                          title="Ver dados"
                          aria-label={`Ver dados de ${client.name}`}
                          onClick={() => {
                            setInitialTab("data");
                            setSelected(client);
                          }}
                        >
                          ◉
                        </button>
                        <button
                          title="Ver emissões"
                          aria-label={`Ver emissões de ${client.name}`}
                          onClick={() => onOpenIssues(client.name)}
                        >
                          ▣
                        </button>
                        <button
                          title="Excluir"
                          aria-label={`Excluir ${client.name}`}
                          onClick={() => remove(client)}
                        >
                          •••
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="supplier-pagination">
        <strong>Itens por página</strong>
        <select className="input" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
          <option value={10}>10</option>
          <option value={20}>20</option>
        </select>
        <strong>Página {currentPage} de {totalPages}</strong>
        <button className="icon-button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Página anterior">‹</button>
        <button className="icon-button" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} aria-label="Próxima página">›</button>
      </div>
      {selected ? (
        <ClientModal
          key={`${selected.id}-${initialTab}`}
          client={selected}
          quotes={quotes}
          initialTab={initialTab}
          onClose={() => setSelected(null)}
          onSave={save}
          onDelete={() => remove(selected)}
        />
      ) : null}
    </div>
  );
}

type ClientTab = "data" | "registration" | "passport";

function ClientCard({
  client,
  names,
  onView,
  onIssues,
}: {
  client: Client;
  names: { first: string; last: string };
  onView: () => void;
  onIssues: () => void;
}) {
  return (
    <article className="client-card">
      <div>
        <strong>
          {names.first} {names.last}
        </strong>
        <p>{client.email || "E-mail não definido"}</p>
        <p>{client.phone || "Telefone não definido"}</p>
      </div>
      <div className="client-row-actions">
        <button onClick={onView} title="Ver dados">
          ◉
        </button>
        <button onClick={onIssues} title="Ver emissões">
          ▣
        </button>
      </div>
    </article>
  );
}

function ClientModal({
  client,
  quotes,
  initialTab,
  onClose,
  onSave,
  onDelete,
}: {
  client: Client;
  quotes: Quote[];
  initialTab: ClientTab;
  onClose: () => void;
  onSave: (client: Client) => void;
  onDelete: () => void;
}) {
  const parts = client.name.trim().split(/\s+/).filter(Boolean);
  const [tab, setTab] = useState<ClientTab>(initialTab);
  const [first, setFirst] = useState(parts[0] || "");
  const [last, setLast] = useState(client.surname || parts.slice(1).join(" "));
  const [draft, setDraft] = useState(client);
  const profit = quotes
    .filter((q) => q.client === client.name && q.status === "emitido")
    .reduce((sum, q) => sum + q.cashPrice - q.cost, 0);
  const commit = () =>
    onSave({
      ...draft,
      name: [first, last].filter(Boolean).join(" "),
      surname: last,
    });
  const copy = (value: string) =>
    value && navigator.clipboard?.writeText(value);
  const DataItem = ({
    label,
    value,
    wide = false,
  }: {
    label: string;
    value: string;
    wide?: boolean;
  }) => (
    <div className={`client-data-item ${wide ? "client-data-wide" : ""}`}>
      <div>
        <strong>{label}</strong>
        <p>{value || "Não definido"}</p>
      </div>
      {value ? (
        <button title={`Copiar ${label}`} onClick={() => copy(value)}>
          ▣
        </button>
      ) : null}
    </div>
  );
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Dados do cliente"
    >
      <div className="modal-card client-modal">
        <div className="modal-title">
          <div className="client-tabs">
            <button
              className={tab === "data" ? "active" : ""}
              onClick={() => setTab("data")}
            >
              Dados
            </button>
            <button
              className={tab === "registration" ? "active" : ""}
              onClick={() => setTab("registration")}
            >
              Cadastro
            </button>
            <button
              className={tab === "passport" ? "active" : ""}
              onClick={() => setTab("passport")}
            >
              Passaporte
            </button>
          </div>
          <button className="row-icon" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        {tab === "data" ? (
          <div className="client-data-grid">
            <DataItem label="Nome" value={first} wide />
            <DataItem label="Sobrenome" value={last} wide />
            <DataItem label="CPF/CNPJ" value={draft.document} />
            <DataItem label="Data de nascimento" value={draft.birthday} />
            <DataItem label="Email" value={draft.email} />
            <DataItem label="Telefone" value={draft.phone} />
            <DataItem
              label="Número do passaporte"
              value={draft.passport}
              wide
            />
            <DataItem label="Lucro" value={money(profit)} wide />
          </div>
        ) : null}
        {tab === "registration" ? (
          <div className="form-grid client-form">
            <Field label="Nome">
              <input
                className="input"
                placeholder="Nome"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
              />
            </Field>
            <Field label="Sobrenome">
              <input
                className="input"
                placeholder="Sobrenome"
                value={last}
                onChange={(e) => setLast(e.target.value)}
              />
            </Field>
            <Field label="CPF/CNPJ">
              <input
                className="input"
                value={draft.document}
                onChange={(e) =>
                  setDraft({ ...draft, document: e.target.value })
                }
                placeholder="000.000.000-00"
              />
            </Field>
            <SingleDatePicker manual label="Data de nascimento" value={draft.birthday} onChange={(birthday) => setDraft({ ...draft, birthday })} />
            <Field label="E-mail">
              <input
                className="input"
                type="email"
                placeholder="exemplo@email.com"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </Field>
            <Field label="Telefone">
              <input
                className="input"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="+55"
              />
            </Field>
            <Field label="Endereço">
              <input
                className="input client-address"
                value={draft.address || ""}
                onChange={(e) =>
                  setDraft({ ...draft, address: e.target.value })
                }
                placeholder="Adicionar endereço"
              />
            </Field>
          </div>
        ) : null}
        {tab === "passport" ? (
          <div className="passport-form">
            <label className="passport-switch">
              <span>
                <strong>Possui passaporte?</strong>
                <small>Permite adicionar dados do passaporte do cliente</small>
              </span>
              <input
                type="checkbox"
                checked={draft.hasPassport || Boolean(draft.passport)}
                onChange={(e) =>
                  setDraft({ ...draft, hasPassport: e.target.checked })
                }
              />
            </label>
            {draft.hasPassport || draft.passport ? (
              <div className="form-grid">
                <Field label="Número do passaporte">
                  <input
                    className="input"
                    placeholder="Ex.: FA123456"
                    value={draft.passport}
                    onChange={(e) =>
                      setDraft({ ...draft, passport: e.target.value })
                    }
                  />
                </Field>
                <SingleDatePicker label="Data de expedição" value={draft.passportIssuedAt || ""} onChange={(passportIssuedAt) => setDraft({ ...draft, passportIssuedAt })} />
                <SingleDatePicker label="Data de validade" value={draft.passportExpiresAt || ""} onChange={(passportExpiresAt) => setDraft({ ...draft, passportExpiresAt })} />
                <Field label="País">
                  <input
                    className="input"
                    placeholder="Ex.: Brasil"
                    value={draft.passportCountry || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, passportCountry: e.target.value })
                    }
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="modal-footer">
          <button className="white-button" onClick={commit}>
            Salvar
          </button>
          <button className="dark-button delete-button" onClick={onDelete}>
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
function Finance({
  quotes,
}: {
  totals: {
    sales: number;
    profit: number;
    costs: number;
    quotes: number;
    issues: number;
  };
  quotes: Quote[];
}) {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year" | "custom">("month");
  const [range, setRange] = useState({ from: "", to: "" });
  const now = new Date();
  const isInPeriod = (value: string) => {
    if (!value) return false;
    const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
    if (period === "custom") return (!range.from || date >= new Date(`${range.from}T00:00:00`)) && (!range.to || date <= new Date(`${range.to}T23:59:59`));
    if (period === "today") return date.toDateString() === now.toDateString();
    if (period === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return date >= start && date < end;
    }
    if (period === "year") return date.getFullYear() === now.getFullYear();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  };
  const financeRows = quotes.filter((quote) =>
    !quote.isDemo &&
    quote.isIssue &&
    quote.status !== "cancelado" &&
    isInPeriod(quote.issue.saleDate || quote.createdAt),
  );
  const quoteRows = quotes.filter((quote) =>
    !quote.isDemo && !quote.isIssue && isInPeriod(quote.createdAt),
  );
  const sales = financeRows.reduce((sum, quote) => sum + quote.cashPrice, 0);
  const costs = financeRows.reduce((sum, quote) => sum + issueCost(quote), 0);
  return (
    <div className="grid gap-5">
      <span className="w-max rounded-full border border-[#1c3148] px-4 py-2 text-sm">
        Beta
      </span>
      <div>
        <p className="text-[#9fc8ee]">RM Partiu Viagens</p>
        <h1 className="text-3xl font-black">Financeiro</h1>
      </div>
      <div className="segments">
        {([['today','Hoje'],['week','Esta semana'],['month','Este mês'],['year','Este ano'],['custom','Escolher período']] as const).map(([value,label]) => <button key={value} className={period === value ? "segment-active" : "segment"} onClick={() => setPeriod(value)}>{label}</button>)}
      </div>
      {period === "custom" ? <div className="form-grid"><DateRangePicker label="Período" start={range.from} end={range.to} onChange={(from, to) => setRange({ from, to })} /></div> : null}
      <div className="metric-grid">
        <Metric title="Vendas" value={money(sales)} />
        <Metric title="Lucro" value={money(sales - costs)} />
        <Metric title="Despesas" value={money(costs)} />
        <Metric title="Orçamentos criados" value={String(quoteRows.length)} />
        <Metric title="Emissões geradas" value={String(financeRows.length)} />
      </div>
      <Panel title="Movimentações">
        {financeRows.map((q) => (
          <TimelineItem
            key={q.id}
            icon="$"
            title={`${q.client} · ${q.destination}`}
            detail={`${money(q.cashPrice)} · lucro ${money(q.cashPrice - issueCost(q))}`}
          />
        ))}
      </Panel>
    </div>
  );
}
function Calendar({
  quotes,
  clients,
  events,
  onChange,
}: {
  quotes: Quote[];
  clients: Client[];
  events: CalendarEvent[];
  onChange: (events: CalendarEvent[]) => void;
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", date: todayIso(), description: "" });
  const [completedAutomaticIds, setCompletedAutomaticIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("rm-travel-hub-calendar-completed-v1") || "[]") as string[];
    } catch {
      return [];
    }
  });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const monthLength = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= monthLength ? day : null;
  });
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(cursor);
  const isoForDay = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  type AgendaItem = CalendarEvent & {
    kind: "manual" | "birthday" | "checkin";
    automatic: boolean;
    whatsappPhone?: string;
    whatsappMessage?: string;
  };
  const whatsappPhone = (value?: string) => {
    const digits = value?.replace(/\D/g, "") || "";
    if (digits.length < 10) return "";
    return digits.startsWith("55") ? digits : `55${digits}`;
  };
  const normalizedName = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
  const automaticItems = useMemo<AgendaItem[]>(() => {
    const birthdays = clients.flatMap((client) => {
      const match = client.birthday?.match(/^\d{4}-(\d{2})-(\d{2})$/);
      if (!match) return [];
      const date = `${year}-${match[1]}-${match[2]}`;
      const parsed = new Date(`${date}T12:00:00`);
      if (Number.isNaN(parsed.getTime()) || parsed.getMonth() + 1 !== Number(match[1])) return [];
      const givenName = client.name.trim();
      const surname = client.surname?.trim() || "";
      const fullName = surname && !normalizedName(givenName).endsWith(normalizedName(surname))
        ? `${givenName} ${surname}`
        : givenName;
      return [{
        id: `birthday-${client.id}-${year}`,
        title: `Aniversário de ${fullName}`,
        date,
        description: "Não esqueça de enviar os parabéns!",
        kind: "birthday" as const,
        automatic: true,
        whatsappPhone: whatsappPhone(client.phone),
        whatsappMessage: `Olá, ${client.name}! Feliz aniversário! A RM Partiu Viagens deseja um dia muito especial para você.`,
      }];
    });
    const checkins = quotes.flatMap((quote) => {
      if (!quote.isIssue || quote.isDemo || (quote.status !== "emitido" && quote.status !== "aguardando")) return [];
      const legs = [
        { key: "out", label: "ida", flight: quote.flightOut, fallbackDate: quote.startDate },
        { key: "back", label: "volta", flight: quote.flightBack, fallbackDate: quote.endDate },
      ];
      return legs.flatMap(({ key, label, flight, fallbackDate }) => {
        const departureDate = flight.date || fallbackDate;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate || "")) return [];
        const checkinDate = new Date(`${departureDate}T12:00:00`);
        if (Number.isNaN(checkinDate.getTime())) return [];
        checkinDate.setDate(checkinDate.getDate() - 2);
        const date = `${checkinDate.getFullYear()}-${String(checkinDate.getMonth() + 1).padStart(2, "0")}-${String(checkinDate.getDate()).padStart(2, "0")}`;
        const route = [flight.from, flight.to].filter(Boolean).join(" → ") || quote.route || quote.destination;
        const locator = quote.issue.locator ? ` Localizador: ${quote.issue.locator}.` : "";
        const departure = departureDate.split("-").reverse().join("/");
        const time = flight.departTime ? ` às ${flight.departTime}` : "";
        const client = clients.find((item) =>
          normalizedName(item.name) === normalizedName(quote.client) ||
          normalizedName(`${item.name} ${item.surname || ""}`) === normalizedName(quote.client),
        );
        return [{
          id: `checkin-${quote.id}-${key}-${departureDate}`,
          title: `Check-in de ${quote.client}${route ? ` · ${route}` : ""}`,
          date,
          description: `Abra o check-in da viagem de ${label}, com embarque em ${departure}${time}.${locator}`,
          kind: "checkin" as const,
          automatic: true,
          whatsappPhone: whatsappPhone(client?.phone),
          whatsappMessage: `Olá, ${quote.client}! O check-in da sua viagem de ${label}${route ? ` (${route})` : ""} já está disponível. Embarque em ${departure}${time}.${locator}`,
        }];
      });
    });
    return [...birthdays, ...checkins];
  }, [clients, quotes, year]);
  const agendaItems: AgendaItem[] = [
    ...automaticItems,
    ...events.map((event) => ({ ...event, kind: "manual" as const, automatic: false })),
  ];
  const selectedItems = agendaItems.filter((event) => event.date === selectedDate);
  const isCompleted = (event: AgendaItem) => event.automatic
    ? completedAutomaticIds.includes(event.id)
    : Boolean(event.completed);
  const toggleCompleted = (event: AgendaItem) => {
    if (event.automatic) {
      setCompletedAutomaticIds((current) => {
        const next = current.includes(event.id)
          ? current.filter((id) => id !== event.id)
          : [...current, event.id];
        localStorage.setItem("rm-travel-hub-calendar-completed-v1", JSON.stringify(next));
        return next;
      });
      return;
    }
    onChange(events.map((item) => item.id === event.id ? { ...item, completed: !item.completed } : item));
  };
  const openCreate = () => {
    setDraft({ title: "", date: selectedDate, description: "" });
    setModalOpen(true);
  };
  return (
    <div className="grid gap-4">
      <Toolbar title="Calendário" action="Adicionar evento" onAction={openCreate} />
      <div className="calendar-shell">
        <Panel title={monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}>
          <div className="mb-4 flex flex-wrap gap-2">
            <button className="dark-mini" onClick={() => setCursor(new Date(year, month - 1, 1))}>← Mês anterior</button>
            <button className="dark-mini" onClick={() => setCursor(new Date())}>Hoje</button>
            <button className="dark-mini" onClick={() => setCursor(new Date(year, month + 1, 1))}>Próximo mês →</button>
          </div>
          <div className="calendar-grid">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <strong key={d}>{d}</strong>
            ))}
            {cells.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="calendar-day calendar-empty" />;
              const date = isoForDay(day);
              const dayItems = agendaItems.filter((item) => item.date === date);
              return (
                <button
                  key={date}
                  className={`calendar-day text-left ${selectedDate === date ? "calendar-selected" : ""}`}
                  onClick={() => setSelectedDate(date)}
                  aria-label={`${day} de ${monthLabel}${dayItems.length ? `, ${dayItems.length} compromisso(s)` : ""}`}
                >
                  <span>{day}</span>
                  {dayItems.slice(0, 2).map((item) => (
                    <em key={item.id} className={`calendar-marker calendar-marker-${item.kind}`} title={item.title}>
                      {item.kind === "birthday" ? "Aniversário" : item.kind === "checkin" ? "Check-in" : item.title}
                    </em>
                  ))}
                  {dayItems.length > 2 ? <small className="calendar-more">+{dayItems.length - 2} compromisso(s)</small> : null}
                </button>
              );
            })}
          </div>
        </Panel>
        <Panel title={`Tarefas de ${selectedDate.split("-").reverse().join("/")}`}>
          {selectedItems.length === 0 ? <p className="text-[#9fc8ee]">Nenhuma tarefa para esta data.</p> : null}
          {selectedItems.map((event) => {
            const completed = isCompleted(event);
            return (
            <div key={event.id} className={`calendar-task calendar-task-${event.kind} ${completed ? "calendar-task-completed" : ""}`}>
              <div className="min-w-0 flex-1">
                <span className="calendar-task-kind">{event.kind === "birthday" ? "Aniversário" : event.kind === "checkin" ? "Check-in" : "Evento"}</span>
                <div className="calendar-task-copy">
                  <strong>{event.title}</strong>
                  <p>{event.description || "Sem descrição"}</p>
                </div>
                {event.whatsappPhone ? (
                  <a
                    className="calendar-whatsapp"
                    href={`https://wa.me/${event.whatsappPhone}?text=${encodeURIComponent(event.whatsappMessage || "Olá!")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Conversar com ${event.title.replace(/^(Aniversário|Check-in) de /, "")} pelo WhatsApp`}
                    title="Abrir conversa no WhatsApp"
                  >
                    <WhatsAppIcon />
                  </a>
                ) : null}
              </div>
              <div className="calendar-task-actions">
                <button
                  className="calendar-read-button"
                  type="button"
                  aria-pressed={completed}
                  onClick={() => toggleCompleted(event)}
                >
                  {completed ? "Marcar como não lido" : "Marcar como lido"}
                </button>
                {!event.automatic ? <button className="danger-mini" aria-label={`Excluir ${event.title}`} onClick={() => { if (confirm(`Excluir o evento ${event.title}?`)) onChange(events.filter((item) => item.id !== event.id)); }}>Excluir</button> : null}
              </div>
            </div>
          );})}
          <button className="light-mini mt-3" onClick={openCreate}>Novo evento</button>
        </Panel>
      </div>
      {modalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card" role="dialog" aria-label="Novo evento">
            <div className="flex items-center justify-between gap-3">
              <h2>Novo evento</h2>
              <button className="danger-mini" onClick={() => setModalOpen(false)}>Fechar</button>
            </div>
            <div className="form-grid mt-4">
              <Field label="Nome do evento"><input className="input" placeholder="Ex.: Confirmar check-in" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
              <SingleDatePicker label="Data" value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
              <Field label="Descrição do evento"><textarea className="input min-h-28" placeholder="Descreva o evento" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="dark-mini" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="light-mini" disabled={!draft.title.trim()} onClick={() => { onChange([{ id: uid(), ...draft }, ...events]); setSelectedDate(draft.date); setModalOpen(false); }}>Salvar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
function Suppliers({
  suppliers,
  onChange,
}: {
  suppliers: Supplier[];
  onChange: (s: Supplier[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"new" | "view" | "edit" | null>(null);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [display, setDisplay] = useState<"table" | "cards">("table");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const filtered = suppliers.filter((s) =>
    `${s.name} ${s.phone ?? s.contact} ${s.document ?? ""} ${s.counter ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const save = (supplier: Supplier) => {
    onChange(
      modal === "edit"
        ? suppliers.map((item) => (item.id === supplier.id ? supplier : item))
        : [supplier, ...suppliers],
    );
    setModal(null);
    setSelected(null);
  };
  const remove = (supplier: Supplier) => {
    if (!confirm(`Deletar o fornecedor ${supplier.name}?`)) return;
    onChange(suppliers.filter((item) => item.id !== supplier.id));
    setMenuId(null);
  };
  return (
    <div className="supplier-page">
      <div className="supplier-toolbar">
        <input
          className="input supplier-search"
          aria-label="Pesquisar fornecedores"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Pesquisar"
        />
        <div className="supplier-actions">
          <button className="light-mini" onClick={() => setModal("new")}>
            ＋ Novo fornecedor
          </button>
          <button
            className={`view-toggle ${display === "table" ? "view-toggle-active" : ""}`}
            onClick={() => setDisplay("table")}
            aria-label="Visualização em tabela"
          >
            ▦
          </button>
          <button
            className={`view-toggle ${display === "cards" ? "view-toggle-active" : ""}`}
            aria-label="Visualização em cartões"
            onClick={() => setDisplay("cards")}
          >
            □
          </button>
        </div>
      </div>
      {filtered.length && display === "table" ? (
        <div className="supplier-table table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome　↕</th>
                <th>Telefone　↕</th>
                <th>Balcão　↕</th>
                <th>CPF/CNPJ　↕</th>
                <th>Criado em</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                  </td>
                  <td>
                    <strong>{s.phone || s.contact || "Não definido"}</strong>
                  </td>
                  <td>{s.counter || s.type || "Não definido"}</td>
                  <td>{s.document || "Não definido"}</td>
                  <td>
                    <strong>
                      {s.createdAt
                        ? `Em ${new Date(s.createdAt).toLocaleDateString("pt-BR")}`
                        : "Há algumas semanas"}
                    </strong>
                  </td>
                  <td>
                    <div className="supplier-row-actions">
                      <button
                        className="row-icon"
                        onClick={() => {
                          setSelected(s);
                          setModal("edit");
                        }}
                      >
                        Editar
                      </button>
                      <button
                        className="row-icon"
                        aria-label={`Ações de ${s.name}`}
                        onClick={() => setMenuId(menuId === s.id ? null : s.id)}
                      >
                        •••
                      </button>
                      {menuId === s.id ? (
                        <div className="supplier-menu">
                          <strong>Ações</strong>
                          <button
                            onClick={() => {
                              setSelected(s);
                              setModal("edit");
                              setMenuId(null);
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className="supplier-delete"
                            onClick={() => remove(s)}
                          >
                            Deletar
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : filtered.length ? (
        <div className="supplier-cards">
          {pageRows.map((s) => (
            <article className="supplier-card" key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <p>{s.phone || s.contact || "Não definido"}</p>
                <p>{s.document || s.counter || s.type || "Não definido"}</p>
              </div>
              <div className="supplier-card-actions">
                <button
                  className="dark-mini"
                  onClick={() => {
                    setSelected(s);
                    setModal("edit");
                  }}
                >
                  Editar
                </button>
                <button className="danger-mini" onClick={() => remove(s)}>
                  Deletar
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>Nenhum fornecedor encontrado</h2>
          <p>Altere a pesquisa ou cadastre um novo fornecedor.</p>
        </div>
      )}
      <div className="supplier-pagination">
        <span>Itens por página</span>
        <select className="input" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
          <option value={10}>10</option>
          <option value={20}>20</option>
        </select>
        <strong>Página {currentPage} de {totalPages}</strong>
        <button className="view-toggle" disabled={currentPage === 1} onClick={() => setPage(1)} aria-label="Primeira página">
          ‹‹
        </button>
        <button className="view-toggle" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Página anterior">
          ‹
        </button>
        <button className="view-toggle" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} aria-label="Próxima página">
          ›
        </button>
        <button className="view-toggle" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)} aria-label="Última página">
          ››
        </button>
      </div>
      {modal === "new" ? (
        <SupplierModal onClose={() => setModal(null)} onSave={save} />
      ) : null}
      {modal === "view" && selected ? (
        <SupplierModal
          initial={selected}
          readOnly
          onClose={() => setModal(null)}
          onSave={() => setModal(null)}
        />
      ) : null}
      {modal === "edit" && selected ? (
        <SupplierModal
          initial={selected}
          onClose={() => setModal(null)}
          onSave={save}
        />
      ) : null}
    </div>
  );
}

function SupplierModal({
  initial,
  newRecord = false,
  readOnly = false,
  onClose,
  onSave,
}: {
  initial?: Supplier;
  newRecord?: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (supplier: Supplier) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? initial?.contact ?? "");
  const [document, setDocument] = useState(initial?.document ?? "");
  const [counter, setCounter] = useState(
    initial?.counter ?? initial?.type ?? "",
  );
  return (
    <div className="modal-backdrop">
      <div
        className="modal-card supplier-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-modal-title"
      >
        <div className="modal-title">
          <h2 id="supplier-modal-title">
            {readOnly
              ? "Detalhes do fornecedor"
              : initial && !newRecord
                ? "Editar fornecedor"
                : "Novo fornecedor"}
          </h2>
          <button className="row-icon" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="form-grid mt-4">
          <Field label="Nome">
            <input
              className="input"
              disabled={readOnly}
              autoFocus={!readOnly}
              placeholder="Nome do fornecedor"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Telefone">
            <div className="phone-field">
              <span>🇧🇷</span>
              <input
                className="input"
                type="tel"
                disabled={readOnly}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+55"
              />
            </div>
          </Field>
          <Field label="CPF/CNPJ">
            <input
              className="input"
              disabled={readOnly}
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder="000.000.000-00"
            />
            <small>Opcional</small>
          </Field>
          <Field label="Balcão">
            <input
              className="input"
              disabled={readOnly}
              value={counter}
              onChange={(e) => setCounter(e.target.value)}
              placeholder="Balcão de vendas"
            />
            <small>Opcional</small>
          </Field>
        </div>
        <div className="modal-footer">
          <button className="dark-mini" onClick={onClose}>
            {readOnly ? "Fechar" : "Cancelar"}
          </button>
          {!readOnly ? (
            <button
              className="light-mini"
              disabled={!name.trim()}
              onClick={() =>
                onSave({
                  id: initial?.id ?? uid(),
                  name: name.trim(),
                  phone,
                  document,
                  counter,
                  type: counter || "Não definido",
                  contact: phone,
                  notes: initial?.notes ?? "",
                  createdAt: initial?.createdAt ?? new Date().toISOString(),
                })
              }
            >
              Salvar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
function Tutorials() {
  return (
    <div className="grid gap-4">
      <Toolbar title="Tutoriais" action="Assistir introdução" />
      <div className="grid gap-3 md:grid-cols-3">
        {[
          "Como criar orçamento",
          "Como gerar emissão",
          "Como conferir financeiro",
        ].map((title) => (
          <Panel key={title} title={title}>
            <div className="grid aspect-video place-items-center rounded-md bg-[#203247] text-3xl">
              ▷
            </div>
            <p className="mt-3 text-sm text-[#9fc8ee]">
              Guia rápido para operação da agência.
            </p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
function Billing() {
  return (
    <div className="grid gap-4">
      <Toolbar title="Minha assinatura" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Plano atual">
          <p className="text-sm text-[#9fc8ee]">Sistema Agência RM</p>
          <h2 className="mt-2 text-2xl font-black">Acesso ativo</h2>
          <p className="mt-3">Ambiente privado da RM Partiu Viagens.</p>
          <span className="mt-4 inline-flex rounded-full border border-[#067647] px-3 py-1 text-[#7ce7b2]">Ativo</span>
        </Panel>
        <Panel title="Cobrança e pagamentos">
          <p className="text-[#9fc8ee]">Nenhuma cobrança configurada nesta versão local.</p>
          <p className="mt-3 text-sm">Quando o sistema for comercializado para outras agências, esta área poderá ser conectada ao provedor de pagamentos escolhido.</p>
        </Panel>
      </div>
      <Panel title="Histórico de faturas">
        <div className="empty-state"><h2>Nenhuma fatura</h2><p>As faturas aparecerão aqui depois da integração de pagamentos.</p></div>
      </Panel>
    </div>
  );
}
function Settings({
  settings,
  onSave,
}: {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onExport: () => void;
  onImport: (file: File | null) => void;
  onReset: () => void;
}) {
  const [form, setForm] = useState(settings);
  const loadLogo = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, logoDataUrl: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };
  return (
    <div className="settings-page">
      <h1>Configurações</h1>

      <section className="settings-section" aria-label="Contato nos orçamentos">
        <Field label="Nome de contato">
          <input className="input" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          <small>Este nome será exibido como forma de contato nos orçamentos gerados</small>
        </Field>
        <Field label="Email de contato">
          <input className="input" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          <small>Este email será exibido como forma de contato nos orçamentos gerados</small>
        </Field>
        <Field label="Telefone de contato">
          <div className="settings-phone">
            <span className="settings-country" aria-label="Brasil">BR</span>
            <input className="input" type="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </div>
          <small>Este telefone será exibido como forma de contato nos orçamentos gerados</small>
        </Field>
      </section>

      <section className="settings-section">
        <h2>Dados da empresa</h2>
        <Field label="Nome da empresa">
          <input className="input" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        </Field>
        <Field label="CNPJ">
          <input className="input" inputMode="numeric" placeholder="00.000.000/0000-00" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
          <small>Opcional</small>
        </Field>
        <Field label="Instagram da empresa">
          <input className="input" placeholder="rmpartiuvigens" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
          <small>Opcional</small>
        </Field>
        <Field label="Logo da empresa">
          <div className="settings-logo-preview">
            {form.logoDataUrl ? <img src={form.logoDataUrl} alt="Logo atual da empresa" /> : <span>RM</span>}
          </div>
          <label className="settings-file-button">
            <span>Escolher arquivo</span>
            <span>{form.logoDataUrl ? "Imagem selecionada" : "Nenhum arquivo escolhido"}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => loadLogo(e.target.files?.[0] ?? null)} />
          </label>
          <small>A imagem será exibida em um formato quadrado</small>
        </Field>
        <Field label="Endereço da empresa">
          <textarea className="input settings-address" placeholder="Avenida, número, cidade, estado e país" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <small>Este endereço será exibido nos documentos gerados</small>
        </Field>
      </section>

      <section className="settings-section">
        <div>
          <h2>Taxas de parcelamento</h2>
          <p className="settings-section-description">Informe as taxas de juros a serem utilizadas nos seus orçamentos</p>
        </div>
        <div className="settings-rates-grid">
          {form.installmentRates.map((rate, index) => (
            <Field key={index} label={`${index + 1}x`}>
              <div className="settings-rate-input">
                <input className="input" inputMode="decimal" value={rate ? String(rate).replace(".", ",") : ""} onChange={(e) => { const rates = [...form.installmentRates]; rates[index] = Number(e.target.value.replace(",", ".")) || 0; setForm({ ...form, installmentRates: rates }); }} />
                <span>%</span>
              </div>
            </Field>
          ))}
        </div>
      </section>

      <section className="settings-section settings-final-section">
        <Field label="Moeda">
          <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as AppSettings["currency"] })}><option value="BRL">Real (R$)</option><option value="USD">Dólar (US$)</option><option value="EUR">Euro (€)</option></select>
        </Field>
        <button className="settings-save-button" type="button" onClick={() => onSave(form)}>Salvar</button>
      </section>
    </div>
  );
}
function PreviewModal({
  mode,
  quote,
  onClose,
}: {
  mode: "share" | "pdf";
  quote: Quote;
  onClose: () => void;
}) {
  const text = `${quote.client} - ${quote.destination} | ${quote.route} | ${money(quote.cashPrice)}`;
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="flex items-center justify-between gap-3">
          <h2>
            {mode === "share" ? "Compartilhar orçamento" : "Preview do PDF"}
          </h2>
          <button className="danger-mini" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="document-preview">
          <strong>RM Partiu Viagens</strong>
          <h3>{quote.destination}</h3>
          <p>{text}</p>
          <p>{quote.notes}</p>
          {quote.showValues ? (
            <p className="document-price">
              {money(quote.cashPrice)} · {quote.installments}
            </p>
          ) : null}
          {quote.qrCode ? <div className="qr-box">PIX</div> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="light-mini" onClick={() => navigator.clipboard?.writeText(text)}>Copiar texto</button>
          {mode === "pdf" ? <button className="dark-mini" onClick={() => window.print()}>Imprimir ou salvar em PDF</button> : null}
        </div>
      </div>
    </div>
  );
}
function AddressModal({
  initial,
  onClose,
  onSave,
}: {
  initial: string;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [street, setStreet] = useState(initial || "");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2>Adicionar endereço</h2>
            <p className="text-sm text-[#9fc8ee]">Cadastre um novo endereço</p>
          </div>
          <button className="danger-mini" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="form-grid mt-4">
          <Field label="Rua">
            <input
              className="input"
              placeholder="Ex.: Rua das Palmeiras"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
            />
          </Field>
          <Field label="Número">
            <input
              className="input"
              placeholder="Ex.: 1050"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </Field>
          <Field label="Cidade">
            <input
              className="input"
              placeholder="Ex.: São Paulo"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </Field>
          <Field label="Complemento">
            <input className="input" placeholder="Opcional" value={complement} onChange={(e) => setComplement(e.target.value)} />
          </Field>
          <Field label="Estado">
            <input
              className="input"
              placeholder="Ex.: SP"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
          </Field>
          <Field label="País">
            <input className="input" placeholder="Ex.: Brasil" value={country} onChange={(e) => setCountry(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="dark-mini" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="light-mini"
            onClick={() => onSave(`${street}, ${number}${complement ? `, ${complement}` : ""} - ${city}/${state}, ${country}`)}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
function Toolbar({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {action ? <button className={title === "Emissões" ? "gold-button" : "light-mini"} onClick={onAction}>{action}</button> : null}
    </div>
  );
}
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-[#1c3148] bg-[#030b16] p-4">
      <h2 className="mb-4 text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}
function SectionBand({
  icon,
  title,
  action,
  onAdd,
  onImport,
  children,
}: {
  icon: string;
  title: string;
  action: string;
  onAdd?: () => void;
  onImport?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="section-band grid gap-4">
      <div className="flight-booking-bar">
        <div className="section-band-title">
          <span>{icon}</span>
          <h2>{title}</h2>
        </div>
        <div className="section-band-actions">
          <button className="dark-mini" type="button" onClick={onAdd}>＋ {action}</button>
          <button className="dark-mini" type="button" onClick={onImport} title={onImport ? "Importar orçamento salvo" : "Importação automática depende da integração do fornecedor"}>⇩ Importar</button>
        </div>
      </div>
      {children}
    </div>
  );
}
function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 text-sm font-bold text-[#d6eaff] ${className}`}>
      {label}
      {children}
    </label>
  );
}
function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={expanded ? "chevron-expanded" : ""}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 15H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function WhatsAppIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.4-4.3a8.5 8.5 0 1 1 15.6-4.5Z" />
      <path d="M8.4 7.8c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.7c.1.3.1.5-.1.7l-.6.7c-.2.2-.1.4 0 .6.6 1 1.5 1.9 2.6 2.4.3.1.5.1.7-.1l.8-1c.2-.2.4-.3.7-.2l1.8.8c.3.1.4.3.4.5 0 .3-.1 1.2-.7 1.8-.6.6-1.5.8-2.4.6-1.2-.3-2.8-.9-4.6-2.5-1.5-1.3-2.5-3-2.8-4.2-.3-.9 0-1.4.3-1.8Z" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
function AirportInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [airports, setAirports] = useState<Airport[]>(airportCache ?? []);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (airportCache) return;
    fetch("/airports.json")
      .then((response) => response.json())
      .then((items: Airport[]) => {
        airportCache = items;
        setAirports(items);
      })
      .catch(() => setAirports([]));
  }, []);

  const query = value.trim().toLocaleLowerCase("pt-BR");
  const suggestions = query.length
    ? airports
        .filter((airport) =>
          `${airport.i} ${airport.c} ${airport.n} ${airport.p}`
            .toLocaleLowerCase("pt-BR")
            .includes(query),
        )
        .sort((a, b) => Number(b.i.toLowerCase().startsWith(query)) - Number(a.i.toLowerCase().startsWith(query)))
        .slice(0, 8)
    : [];

  return (
    <div className="airport-input-wrap">
      <input
        className="input"
        autoComplete="off"
        placeholder="Digite IATA, cidade ou aeroporto"
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => onChange(event.target.value)}
      />
      {focused && suggestions.length ? (
        <div className="airport-suggestions" role="listbox">
          {suggestions.map((airport) => (
            <button
              key={`${airport.i}-${airport.n}`}
              type="button"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(`${airport.i} - ${airport.c}, ${airport.p}`);
                setFocused(false);
              }}
            >
              <strong>{airport.i}</strong>
              <span className="airport-option-copy">
                <b>{airport.c}, {airport.p}</b>
                <small>{airport.n}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
function CurrencyInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      className="input currency-input"
      inputMode="numeric"
      placeholder="R$ 0,00"
      value={value ? money(value) : ""}
      onChange={(event) => {
        const cents = event.target.value.replace(/\D/g, "");
        onChange(cents ? Number(cents) / 100 : 0);
      }}
    />
  );
}
function TimeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const update = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    const formatted = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    if (digits.length === 4) {
      const hours = Number(digits.slice(0, 2));
      const minutes = Number(digits.slice(2));
      if (hours > 23 || minutes > 59) return;
    }
    onChange(formatted);
  };
  return (
    <div className="time-input-wrap">
      <input
        className="input"
        inputMode="numeric"
        maxLength={5}
        placeholder="HH:mm"
        title="Horário em formato 24 horas, GMT-3"
        value={value}
        onChange={(event) => update(event.target.value)}
      />
      <span>GMT-3</span>
    </div>
  );
}
function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border border-[#1c3148] bg-[#030b16] p-4">
      <p className="text-sm text-[#9fc8ee]">{title}</p>
      <strong className="mt-2 block text-2xl font-black tabular-nums">
        {value}
      </strong>
    </div>
  );
}
function Segment({ value, onChange }: { value: "today" | "week" | "month" | "year"; onChange: (value: "today" | "week" | "month" | "year") => void }) {
  const items = [["today", "Hoje"], ["week", "Esta semana"], ["month", "Este mês"], ["year", "Este ano"]] as const;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(([key, label]) => (
        <button key={key} className={value === key ? "segment-active" : "segment"} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}
function TimelineItem({
  icon,
  title,
  detail,
}: {
  icon: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-md bg-[#203247] px-3 py-3">
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-sm text-[#9fc8ee]">{detail}</p>
        <strong className="text-sm">{title}</strong>
      </div>
    </div>
  );
}
function Badge({ status }: { status: Status }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-black ${status === "emitido" ? "bg-emerald-500/20 text-emerald-200" : status === "aguardando" ? "bg-amber-400/20 text-amber-100" : "bg-sky-400/20 text-sky-100"}`}
    >
      {statusText[status]}
    </span>
  );
}
function FlightTicket({ flight }: { flight: Flight }) {
  return (
    <div className="mt-4 rounded-md border border-[#1c3148] p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm text-[#9fc8ee]">Saindo</p>
          <strong className="text-2xl">{flight.departTime}</strong>
          <p className="mt-2 font-bold">{flight.from}</p>
          <p className="text-sm text-[#9fc8ee]">{flight.date}</p>
        </div>
        <div>
          <p className="text-sm text-[#9fc8ee]">Chegada</p>
          <strong className="text-2xl">{flight.arriveTime}</strong>
          <p className="mt-2 font-bold">{flight.to}</p>
          <p className="text-sm text-[#9fc8ee]">
            {flight.airline} · {flight.code}
          </p>
        </div>
      </div>
    </div>
  );
}
function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-bold text-[#9fc8ee]">
      {label}
      <input
        className="input"
        type="number"
        min="0"
        placeholder="0"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function Feature({ text }: { text: string }) {
  return (
    <div className="rounded-md bg-[#203247] p-3 text-sm font-semibold text-[#cfe7ff]">
      {text}
    </div>
  );
}
function CarFeatureCard({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={`car-feature-card ${active ? "car-feature-active" : ""}`} aria-pressed={active} onClick={onClick}>
    <span aria-hidden="true">{icon}</span><strong>{label}</strong>
  </button>;
}
function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function LoginState({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível entrar.");
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="grid min-h-screen place-items-center bg-[#020916] px-4 text-white">
      <form className="w-full max-w-sm rounded-xl border border-[#1c3148] bg-[#030b16] p-6 shadow-2xl" onSubmit={submit}>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#ffc83d]">RM Partiu Viagens</p>
        <h1 className="mt-2 text-2xl font-bold">Acessar o CRM</h1>
        <p className="mt-2 text-sm text-[#9fc8ee]">Use suas credenciais administrativas para acessar os dados da agência.</p>
        <label className="mt-5 block text-sm font-bold" htmlFor="crm-email">Usuário</label>
        <input
          id="crm-email"
          className="input mt-2"
          type="email"
          inputMode="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />
        <label className="mt-4 block text-sm font-bold" htmlFor="crm-password">Senha</label>
        <input
          id="crm-password"
          className="input mt-2"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="mt-3 text-sm text-red-300" role="alert">{error}</p> : null}
        <button className="gold-button mt-5 w-full" type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
