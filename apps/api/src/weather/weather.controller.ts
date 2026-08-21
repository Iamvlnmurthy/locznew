import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Public } from '../rbac/rbac.decorators';
import { LocalAlert, LocalAlertsService } from './local-alerts.service';
import { AreaCount, LocalAreaService } from './local-area.service';
import { LocalDeal, LocalDealsService } from './local-deals.service';
import { JobPosting, LocalJobsService } from './local-jobs.service';
import { LocalNewsService, NewsHeadline } from './local-news.service';
import { LocalWeather } from './weather.mapper';
import { WeatherService } from './weather.service';

class WeatherQueryDto {
  @Type(() => Number) @IsLatitude() latitude!: number;
  @Type(() => Number) @IsLongitude() longitude!: number;
}

class AreaSummaryQueryDto {
  @IsOptional() @IsString() cityId?: string;
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'A pincode is exactly six digits' })
  pincode?: string;
}

class NewsQueryDto {
  @IsString() @MaxLength(80) q!: string;
}

class AlertsQueryDto {
  @IsString() @MaxLength(80) q!: string;
  @IsOptional() @IsString() cityId?: string;
}

@ApiTags('local-now')
@Controller('local-now')
export class WeatherController {
  constructor(
    private readonly weather: WeatherService,
    private readonly localArea: LocalAreaService,
    private readonly localNews: LocalNewsService,
    private readonly localJobs: LocalJobsService,
    private readonly localDeals: LocalDealsService,
    private readonly localAlerts: LocalAlertsService,
  ) {}

  @Public()
  @Get('weather')
  @ApiOperation({ summary: 'Current weather for a point (null when weather is not configured)' })
  async current(@Query() query: WeatherQueryDto): Promise<{ weather: LocalWeather | null }> {
    return { weather: await this.weather.current(query.latitude, query.longitude) };
  }

  @Public()
  @Get('area-summary')
  @ApiOperation({ summary: 'How many known places fall in each discovery area near the viewer' })
  async areaSummary(@Query() query: AreaSummaryQueryDto): Promise<{ areas: AreaCount[] }> {
    return { areas: await this.localArea.summary(query) };
  }

  @Public()
  @Get('news')
  @ApiOperation({ summary: 'Live local news headlines for an area (empty when none / on failure)' })
  async news(@Query() query: NewsQueryDto): Promise<{ headlines: NewsHeadline[] }> {
    return { headlines: await this.localNews.headlines(query.q) };
  }

  @Public()
  @Get('jobs')
  @ApiOperation({ summary: 'Live local job openings for an area (empty when not configured)' })
  async jobs(@Query() query: NewsQueryDto): Promise<{ jobs: JobPosting[] }> {
    return { jobs: await this.localJobs.nearby(query.q) };
  }

  @Public()
  @Get('deals')
  @ApiOperation({ summary: 'Live affiliate deals/offers (empty when not configured)' })
  async deals(): Promise<{ deals: LocalDeal[] }> {
    return { deals: await this.localDeals.list() };
  }

  @Public()
  @Get('alerts')
  @ApiOperation({ summary: 'Official public-safety alerts (NDMA SACHET) naming the viewer area' })
  async alerts(@Query() query: AlertsQueryDto): Promise<{ alerts: LocalAlert[] }> {
    // With a cityId we widen the match to the city's district and state (CAP warnings are usually
    // state-level); otherwise fall back to the raw query term.
    const terms = await this.localAlerts.areaTermsForCity(query.cityId, query.q);
    return { alerts: await this.localAlerts.forArea(terms) };
  }
}
