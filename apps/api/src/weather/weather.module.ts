import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';

/**
 * "Local Now" weather — display-only, cached, and entirely optional (off without an API key).
 * See docs/DATA_ENGINE_PLAN.md (weather = highly time-sensitive, never stored).
 */
@Module({
  imports: [RedisModule],
  controllers: [WeatherController],
  providers: [WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
