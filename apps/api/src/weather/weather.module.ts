import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { LocalAreaService } from './local-area.service';
import { LocalJobsService } from './local-jobs.service';
import { LocalNewsService } from './local-news.service';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';

/**
 * "Local Now" — the live, low-persistence local layer. Weather is fetched + cached (never stored);
 * the area summary is a cached rollup of the POIs LocZ already holds, so a brand-new area looks
 * alive from day one. See docs/LIVE_LOCAL_DATA_PLAN.md and docs/DATA_ENGINE_PLAN.md.
 */
@Module({
  imports: [RedisModule],
  controllers: [WeatherController],
  providers: [WeatherService, LocalAreaService, LocalNewsService, LocalJobsService],
  exports: [WeatherService, LocalAreaService, LocalNewsService, LocalJobsService],
})
export class WeatherModule {}
