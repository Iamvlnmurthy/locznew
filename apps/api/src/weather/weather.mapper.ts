/**
 * Pure mapping of an OpenWeather "current weather" payload to the small shape LocZ shows in the
 * "Local Now" strip. Kept separate so it is unit-testable without a network call, and so the
 * provider can be swapped without touching the rest of the app.
 */

export interface LocalWeather {
  tempC: number;
  feelsLikeC: number;
  condition: string; // e.g. "Clouds"
  description: string; // e.g. "broken clouds"
  icon: string; // OpenWeather icon code, e.g. "04d"
  place: string | null;
}

interface OpenWeatherResponse {
  name?: string;
  main?: { temp?: number; feels_like?: number };
  weather?: Array<{ main?: string; description?: string; icon?: string }>;
}

/** Returns null when the payload is missing the essentials rather than inventing values. */
export function mapWeather(raw: unknown): LocalWeather | null {
  const data = raw as OpenWeatherResponse;
  const temp = data?.main?.temp;
  const w = data?.weather?.[0];
  if (typeof temp !== 'number' || !w?.main) return null;

  return {
    tempC: Math.round(temp),
    feelsLikeC: Math.round(data.main?.feels_like ?? temp),
    condition: w.main,
    description: w.description ?? w.main,
    icon: w.icon ?? '01d',
    place: data.name ?? null,
  };
}
