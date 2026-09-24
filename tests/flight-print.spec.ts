import { expect, test } from "@playwright/test";
import { parseFlightPrint } from "../src/lib/flight-print";

test("lê ida e volta do print do Google Voos", () => {
  const text = `
    São Paulo ↔ Brasília
    Ida e volta · Econômica · 1 passageiro
    Voo de ida · qui., 15 de out.
    15:00 · Aeroporto de São Paulo/Congonhas–Deputado Freitas Nobre (CGH)
    Tempo de viagem: 1h 45 min
    16:45 · Aeroporto Internacional de Brasília (BSB)
    LATAM · Econômica · Airbus A320 · LA 3581
    Voo de volta · seg., 19 de out.
    06:00 · Aeroporto Internacional de Brasília (BSB)
    Tempo de viagem: 1h 45 min
    07:45 · Aeroporto de São Paulo/Congonhas (CGH)
    LATAM · Econômica · Airbus A320 · LA 3005
  `;

  expect(parseFlightPrint(text, new Date("2026-09-23T12:00:00"))).toEqual([
    expect.objectContaining({ code: "LA3581", airline: "LATAM", from: "CGH", to: "BSB", departTime: "15:00", arriveTime: "16:45", date: "2026-10-15", cabinClass: "Econômica", passengerCount: 1 }),
    expect.objectContaining({ code: "LA3005", airline: "LATAM", from: "BSB", to: "CGH", departTime: "06:00", arriveTime: "07:45", date: "2026-10-19", cabinClass: "Econômica", passengerCount: 1 }),
  ]);
});

test("mantém compatibilidade com IATA antes do horário e data numérica", () => {
  expect(parseFlightPrint("10/11/2026 CGH 09:05 BSB 10:50 LATAM LA 3000")).toEqual([
    expect.objectContaining({ code: "LA3000", from: "CGH", to: "BSB", date: "2026-11-10" }),
  ]);
});
