import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, Matches } from 'class-validator';
import { Public } from '../rbac/rbac.decorators';
import { AreaCount, LocalAreaService } from './local-area.service';
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

@ApiTags('local-now')
@Controller('local-now')
export class WeatherController {
  constructor(
    private readonly weather: WeatherService,
    private readonly localArea: LocalAreaService,
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
}
