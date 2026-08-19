import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';
import { Public } from '../rbac/rbac.decorators';
import { LocalWeather } from './weather.mapper';
import { WeatherService } from './weather.service';

class WeatherQueryDto {
  @Type(() => Number) @IsLatitude() latitude!: number;
  @Type(() => Number) @IsLongitude() longitude!: number;
}

@ApiTags('local-now')
@Controller('local-now')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  @Public()
  @Get('weather')
  @ApiOperation({ summary: 'Current weather for a point (null when weather is not configured)' })
  async current(@Query() query: WeatherQueryDto): Promise<{ weather: LocalWeather | null }> {
    return { weather: await this.weather.current(query.latitude, query.longitude) };
  }
}
