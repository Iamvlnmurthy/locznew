import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { LocalWeather, mapMetNo } from './weather.mapper';

/**
 * Current weather for a point, for the "Local Now" strip.
 *
 * Provider is MET Norway (met.no): key-less, global (incl. India), commercial-use permitted with
 * attribution + an identifying User-Agent (both included below). Temperature is Celsius — the
 * Indian standard — natively. Weather is highly time-sensitive and display-only (plan Parts 32,
 * 64): never stored, only cached in Redis for a short window. Any failure degrades to null so the
 * strip simply hides rather than breaking the page.
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private static readonly TTL_SECONDS = 600; // 10 minutes
  // met.no's terms require a unique, identifying User-Agent; requests without one are blocked.
  private static readonly USER_AGENT = 'LocZ/1.0 (https://locz.in; support@locz.in)';

  constructor(private readonly redis: RedisService) {}

  async current(latitude: number, longitude: number): Promise<LocalWeather | null> {
    // Cache on a coarse grid so nearby users share a fetch (weather does not vary within ~1 km),
    // which also keeps well within met.no's fair-use limits.
    const key = `weather:${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
    const cached = await this.redis.getJson<LocalWeather>(key);
    if (cached) return cached;

    try {
      const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': WeatherService.USER_AGENT },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) return null;
      const weather = mapMetNo(await response.json());
      if (weather) await this.redis.setJson(key, weather, WeatherService.TTL_SECONDS);
      return weather;
    } catch (error) {
      this.logger.warn(`Weather fetch failed: ${(error as Error).message}`);
      return null;
    }
  }
}
