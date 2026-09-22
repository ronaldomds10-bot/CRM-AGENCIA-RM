export const PLACES_NOT_CONFIGURED = "Integração com hospedagens ainda não configurada.";

export function getGooglePlacesApiKey(): string | null {
  const value = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return value && value !== "INSERIR_MANUALMENTE" ? value : null;
}

export async function fetchGooglePlaces(path: string, init: RequestInit = {}) {
  const key = getGooglePlacesApiKey();
  if (!key) return null;
  if (!path.startsWith("/v1/") || path.includes("..") || path.includes("\\")) throw new Error("Invalid Google Places path");
  return fetch(`https://places.googleapis.com${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: { ...init.headers, "X-Goog-Api-Key": key },
  });
}
