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

// Friendly labels for the common MET Norway symbol codes (India-relevant ones first). The raw
// codes are lowercase and concatenated ("partlycloudy_day"), so they must be looked up, not split.
const MET_LABELS: Record<string, string> = {
  clearsky: 'Clear sky',
  fair: 'Fair',
  partlycloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  lightrain: 'Light rain',
  lightrainshowers: 'Light rain showers',
  rain: 'Rain',
  rainshowers: 'Rain showers',
  heavyrain: 'Heavy rain',
  heavyrainshowers: 'Heavy rain showers',
  lightrainandthunder: 'Light rain and thunder',
  rainandthunder: 'Rain and thunder',
  heavyrainandthunder: 'Heavy rain and thunder',
  sleet: 'Sleet',
  snow: 'Snow',
  lightsnow: 'Light snow',
  heavysnow: 'Heavy snow',
};

interface MetNoResponse {
  properties?: {
    timeseries?: Array<{
      data?: {
        instant?: { details?: { air_temperature?: number } };
        next_1_hours?: { summary?: { symbol_code?: string } };
        next_6_hours?: { summary?: { symbol_code?: string } };
      };
    }>;
  };
}

/**
 * Maps a MET Norway (met.no) locationforecast payload. Key-less and commercial-use permitted with
 * attribution. Temperature is Celsius natively — the Indian standard — so no conversion is needed.
 */
export function mapMetNo(raw: unknown): LocalWeather | null {
  const series = (raw as MetNoResponse)?.properties?.timeseries?.[0];
  const temp = series?.data?.instant?.details?.air_temperature;
  if (typeof temp !== 'number') return null;

  const symbol =
    series?.data?.next_1_hours?.summary?.symbol_code ??
    series?.data?.next_6_hours?.summary?.symbol_code ??
    'clearsky';
  const base = symbol.replace(/_(day|night|polartwilight)$/, '');
  const description = MET_LABELS[base] ?? base.charAt(0).toUpperCase() + base.slice(1);

  return {
    tempC: Math.round(temp),
    feelsLikeC: Math.round(temp),
    condition: base,
    description,
    icon: symbol,
    place: null,
  };
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
