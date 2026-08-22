import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public, RequirePermissions } from '../rbac/rbac.decorators';
import { PrismaService } from '../prisma/prisma.service';
import type { CoverageScope } from './feed/ranking';
import { NewsFeedService } from './feed/news-feed.service';
import { NewsIngestService } from './ingest/news-ingest.service';
import { NewsSourceService } from './sources/news-source.service';

const SCOPES = ['local', 'city', 'district', 'state', 'india'] as const;

class FeedQueryDto {
  @Type(() => Number) @IsLatitude() latitude!: number;
  @Type(() => Number) @IsLongitude() longitude!: number;
  @IsOptional() @IsString() @MaxLength(8) lang?: string;
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsIn(SCOPES) scope?: CoverageScope;
  @IsOptional() @IsString() after?: string;
  @IsOptional() @Type(() => Number) offset?: number;
  @IsOptional() @Type(() => Number) limit?: number;
}

class IngestDto {
  @IsString() @MaxLength(120) area!: string;
  @IsString() @MaxLength(8) language!: string;
}

@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(
    private readonly feed: NewsFeedService,
    private readonly ingest: NewsIngestService,
    private readonly sources: NewsSourceService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('feed')
  @ApiOperation({
    summary: 'Hyperlocal news events near a point, ranked by distance-ring + freshness',
  })
  async getFeed(@Query() q: FeedQueryDto) {
    return this.feed.getFeed({
      latitude: q.latitude,
      longitude: q.longitude,
      category: q.category,
      scope: q.scope,
      after: q.after,
      offset: q.offset,
      limit: q.limit,
    });
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'One news event with its source attributions' })
  async getEvent(@Param('slug') slug: string) {
    const event = await this.prisma.newsEvent.findUnique({
      where: { slug },
      include: {
        articles: { include: { article: { select: { publisher: true, sourceUrl: true } } } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return {
      slug: event.slug,
      title: event.title,
      summary: event.summary,
      categories: event.categories,
      publishedAt: event.latestUpdateAt,
      sources: event.articles.map((a) => ({
        publisher: a.article.publisher,
        url: a.article.sourceUrl,
      })),
    };
  }

  @RequirePermissions('category:manage')
  @Post('admin/ingest')
  @ApiOperation({ summary: 'Register a Google News feed for an area+language and ingest it now' })
  async triggerIngest(@Body() body: IngestDto) {
    const target = await this.sources.ensureGoogleNewsFeed(body.area, body.language);
    return this.ingest.ingestFeed(target);
  }
}
