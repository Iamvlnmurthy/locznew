import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import { RedisService } from '../redis/redis.service';
import { LocalWeather, mapWeather } from './weather.mapper';

/**
 * Current weather for a point, for the "Local Now" strip. Weather is highly time-sensitive and
 * display-only (plan Parts 32, 64): never stored, cached in Redis for a short window, and the
 * whole feature is a no-op when no OPENWEATHER_API_KEY is configured — so it can never break the
 * app or add a cold-start dependency.
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private static readonly TTL_SECONDS = 600; // 10 minutes

  constructor(
    private readonly config: AppConfig,
    private readonly redis: RedisService,
  ) {}

  async current(latitude: number, longitude: number): Promise<LocalWeather | null> {
    const apiKey = this.config.get('OPENWEATHER_API_KEY');
    if (!apiKey) return null;

    // Cache on a coarse grid so nearby users share a fetch (weather does not vary within ~1 km).
    const key = `weather:${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
    const cached = await this.redis.getJson<LocalWeather>(key);
    if (cached) return cached;

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${apiKey}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) return null;
      const weather = mapWeather(await response.json());
      if (weather) await this.redis.setJson(key, weather, WeatherService.TTL_SECONDS);
      return weather;
    } catch (error) {
      this.logger.warn(`Weather fetch failed: ${(error as Error).message}`);
      return null;
    }
  }
}
