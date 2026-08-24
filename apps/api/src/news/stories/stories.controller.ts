import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../../rbac/rbac.decorators';
import { StoriesService, type TimeWindow } from './stories.service';

const WINDOWS: TimeWindow[] = ['today', 'yesterday', 'week', 'month', 'all'];

class StoryFeedDto {
  @ApiPropertyOptional({ example: 17.4483 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 78.3915 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'political/national/state/local/business/tech/sports/entertainment/weather',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;

  @ApiPropertyOptional({ enum: WINDOWS, default: 'all' })
  @IsOptional()
  @IsIn(WINDOWS)
  when?: TimeWindow;

  @ApiPropertyOptional({ example: 'te', description: 'en | hi | te (state language)' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  lang?: string;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  offset?: number;
}

/**
 * Public feed over the regenerated LocZ stories (`news_stories`). Distance-increasing rings +
 * time window (today/yesterday/week/month) + place + category, one story language chosen per
 * request. Kept on the `/news/stories` path so it can run alongside the legacy event feed until
 * the client fully switches over.
 */
@ApiTags('news')
@Controller('news/stories')
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'LocZ news feed: distance rings + time window + place + category' })
  feed(@Query() q: StoryFeedDto) {
    return this.stories.feed(q);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'One LocZ story in the requested language' })
  async byId(@Param('id', ParseUUIDPipe) id: string, @Query('lang') lang?: string) {
    const story = await this.stories.byId(id, lang ?? 'en');
    if (!story) throw new NotFoundException('Story not found');
    return story;
  }
}
