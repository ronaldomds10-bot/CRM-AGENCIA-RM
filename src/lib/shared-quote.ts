import "server-only";

type AnyRecord = Record<string, unknown>;

const object = (value: unknown): AnyRecord => value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
const string = (value: unknown, max = 500) => typeof value === "string" ? value.slice(0, max) : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const boolean = (value: unknown) => value === true;
const array = (value: unknown) => Array.isArray(value) ? value : [];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isShareId = (value: string) => uuidPattern.test(value);

function publicFlight(value: unknown) {
  const flight = object(value);
  return {
    segmentId: string(flight.segmentId, 100), code: string(flight.code, 40), airline: string(flight.airline, 120), cabinClass: string(flight.cabinClass, 80),
    from: string(flight.from, 180), to: string(flight.to, 180), departTime: string(flight.departTime, 10), arriveTime: string(flight.arriveTime, 10),
    date: string(flight.date, 10), arrivalDate: string(flight.arrivalDate, 10), adults: number(flight.adults), children: number(flight.children), bags: number(flight.bags),
    passengers: [], checkedBags: number(flight.checkedBags), carryOnBags: number(flight.carryOnBags), backpacks: number(flight.backpacks),
    checkedBagWeight: number(flight.checkedBagWeight), carryOnWeight: number(flight.carryOnWeight), pets: number(flight.pets), refundable: boolean(flight.refundable),
  };
}

function publicCar(value: unknown) {
  const car = object(value);
  return {
    pickupDate: string(car.pickupDate, 10), returnDate: string(car.returnDate, 10), pickupTime: string(car.pickupTime, 10), returnTime: string(car.returnTime, 10),
    pickupAddress: string(car.pickupAddress), returnAddress: string(car.returnAddress), models: string(car.models, 300), passengers: number(car.passengers), doors: number(car.doors),
    sameLocation: boolean(car.sameLocation), airConditioning: boolean(car.airConditioning), airbag: boolean(car.airbag), abs: boolean(car.abs), electricWindows: boolean(car.electricWindows),
    electricLocks: boolean(car.electricLocks), powerSteering: boolean(car.powerSteering), automatic: boolean(car.automatic), refundable: boolean(car.refundable),
  };
}

function publicHotel(value: unknown) {
  const hotel = object(value);
  return {
    name: string(hotel.name, 200), address: string(hotel.address), checkin: string(hotel.checkin, 10), checkout: string(hotel.checkout, 10),
    checkinTime: string(hotel.checkinTime, 10), checkoutTime: string(hotel.checkoutTime, 10), rooms: number(hotel.rooms), guests: number(hotel.guests),
    breakfast: boolean(hotel.breakfast), refundable: boolean(hotel.refundable),
    photoNames: array(hotel.photoNames).filter((item): item is string => typeof item === "string" && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(item)).slice(0, 5),
  };
}

function publicInsurance(value: unknown) {
  const insurance = object(value);
  return { description: string(insurance.description, 1_500), provider: string(insurance.provider, 160), plan: string(insurance.plan, 160), travelers: number(insurance.travelers), price: 0 };
}

function publicTour(value: unknown) {
  const tour = object(value);
  return {
    name: string(tour.name, 200), provider: string(tour.provider, 160), date: string(tour.date, 10), description: string(tour.description, 2_000),
    observation: string(tour.observation, 1_000), price: 0, travelers: number(tour.travelers), refundable: boolean(tour.refundable),
  };
}

function publicTransfer(value: unknown) {
  const transfer = object(value);
  return {
    ...publicTour(transfer), outboundOrigin: string(transfer.outboundOrigin, 200), outboundDestination: string(transfer.outboundDestination, 200),
    returnOrigin: string(transfer.returnOrigin, 200), returnDestination: string(transfer.returnDestination, 200), category: string(transfer.category, 80),
  };
}

export function publicQuoteDto(value: unknown) {
  const quote = object(value);
  return {
    id: string(quote.id, 100), createdAt: string(quote.createdAt, 40), name: string(quote.name, 200), client: string(quote.client, 200), destination: string(quote.destination, 300),
    route: string(quote.route, 300), startDate: string(quote.startDate, 10), endDate: string(quote.endDate, 10), status: string(quote.status, 30), cashPrice: number(quote.cashPrice),
    notes: string(quote.notes, 3_000), showValues: boolean(quote.showValues), installments: string(quote.installments, 40), paymentOption: string(quote.paymentOption, 200),
    flightOut: publicFlight(quote.flightOut), flightBack: publicFlight(quote.flightBack), flightOutSegments: array(quote.flightOutSegments).slice(0, 8).map(publicFlight),
    flightBackSegments: array(quote.flightBackSegments).slice(0, 8).map(publicFlight), car: publicCar(quote.car), hotel: publicHotel(quote.hotel),
    hotelOptions: array(quote.hotelOptions).slice(0, 8).map(publicHotel), insurance: publicInsurance(quote.insurance), tours: array(quote.tours).slice(0, 30).map(publicTour),
    transfers: array(quote.transfers).slice(0, 30).map(publicTransfer),
  };
}

export function publicSettingsDto(value: unknown) {
  const settings = object(value);
  const rawLogo = string(settings.logoDataUrl, 2_000_000);
  const logoDataUrl = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(rawLogo) ? rawLogo : "";
  const instagram = string(settings.instagram, 40).replace(/^@/, "");
  const rates = array(settings.installmentRates).slice(0, 24).map(number).filter((rate) => rate >= 0 && rate <= 100);
  return {
    contactName: string(settings.contactName, 120), contactEmail: string(settings.contactEmail, 254), contactPhone: string(settings.contactPhone, 40),
    companyName: string(settings.companyName, 160), document: "", instagram: /^[A-Za-z0-9._]{1,30}$/.test(instagram) ? instagram : "", address: "",
    logoDataUrl, currency: ["BRL", "USD", "EUR"].includes(String(settings.currency)) ? settings.currency : "BRL", installmentRates: rates,
  };
}
