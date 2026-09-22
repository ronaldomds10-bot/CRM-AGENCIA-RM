import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const airlineReservationPages: Record<string, string> = {
  azul: "https://www.voeazul.com.br/br/pt/minhas-viagens",
  "american airlines": "https://www.aa.com.br/reservation/findReservationSubmit.do?locale=pt_PT",
  gol: "https://b2c.voegol.com.br/check-in/",
  iberia: "https://www.iberia.com/br/gerencie-sua-reserva/",
  latam: "https://www.latamairlines.com/br/pt/minhas-viagens",
};

const flightSchema = {
  type: "object",
  properties: {
    locator: { type: "string", description: "Booking reference, record locator or confirmation code" },
    airline: { type: "string", description: "Main airline name" },
    passengers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          surname: { type: "string" },
          ticket: { type: "string", description: "E-ticket number when available" },
        },
      },
    },
    flights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          direction: { type: "string", description: "outbound for ida or return for volta" },
          flightCode: { type: "string" },
          airline: { type: "string" },
          cabinClass: { type: "string" },
          originIata: { type: "string" },
          originCity: { type: "string" },
          originCountry: { type: "string" },
          destinationIata: { type: "string" },
          destinationCity: { type: "string" },
          destinationCountry: { type: "string" },
          departureDate: { type: "string", description: "Departure date in YYYY-MM-DD format" },
          arrivalDate: { type: "string", description: "Arrival date in YYYY-MM-DD format" },
          departureTime: { type: "string", description: "Local departure time in HH:mm format" },
          arrivalTime: { type: "string", description: "Local arrival time in HH:mm format" },
        },
      },
    },
  },
  required: ["flights"],
};

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const apiKey = process.env.THUNDERBIT_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "A integração Thunderbit ainda não foi configurada." }, { status: 503 });

  const body = await request.json().catch(() => null) as { locator?: string; surname?: string; airline?: string; departureAirport?: string } | null;
  const airline = body?.airline?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const reservationPage = airlineReservationPages[airline];
  if (!body?.locator?.trim() || !body?.departureAirport?.trim()) {
    return NextResponse.json({ error: "Informe o localizador e o aeroporto de partida." }, { status: 400 });
  }
  if (airline === "gol" && !body?.surname?.trim()) {
    return NextResponse.json({ error: "Informe o sobrenome do passageiro." }, { status: 400 });
  }
  if (!reservationPage) return NextResponse.json({ error: "Companhia aérea não suportada." }, { status: 400 });

  const target = new URL(reservationPage);
  if (airline === "gol") {
    target.searchParams.set("recordLocator", body.locator.trim().toUpperCase());
    target.searchParams.set("departureAirport", body.departureAirport.trim().toUpperCase());
  }

  try {
    const response = await fetch("https://openapi.thunderbit.com/openapi/v1/extract", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: target.toString(),
        schema: flightSchema,
        timeout: 55000,
        waitFor: 5000,
        renderMode: "full",
      }),
      signal: AbortSignal.timeout(60000),
      cache: "no-store",
    });
    const result = await response.json().catch(() => null) as { success?: boolean; data?: { data?: unknown[] }; error?: { message?: string; code?: string } } | null;
    if (!response.ok || !result?.success) {
      const message = result?.error?.code === "SCRAPE_SITE_ERROR"
        ? "A GOL bloqueou a consulta automatizada dessa reserva. A URL está correta, mas o site recusou o acesso da Thunderbit."
        : result?.error?.message || "A Thunderbit não conseguiu consultar essa reserva.";
      return NextResponse.json({ error: message, code: result?.error?.code }, { status: response.status || 502 });
    }
    const extracted = result.data?.data?.[0];
    if (!extracted || typeof extracted !== "object") return NextResponse.json({ error: "Nenhum dado de voo foi encontrado nessa página." }, { status: 422 });
    return NextResponse.json({ data: extracted, context: { locator: body?.locator ?? "", surname: body?.surname ?? "", airline: body?.airline ?? "" } });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json({ error: timedOut ? "A consulta demorou mais de 60 segundos. Tente novamente." : "Falha ao conectar com a Thunderbit." }, { status: 504 });
  }
}
