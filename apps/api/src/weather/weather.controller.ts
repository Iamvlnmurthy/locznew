import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Public } from '../rbac/rbac.decorators';
import { AreaCount, LocalAreaService } from './local-area.service';
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

@ApiTags('local-now')
@Controller('local-now')
export class WeatherController {
  constructor(
    private readonly weather: WeatherService,
    private readonly localArea: LocalAreaService,
    private readonly localNews: LocalNewsService,
    private readonly localJobs: LocalJobsService,
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
}
