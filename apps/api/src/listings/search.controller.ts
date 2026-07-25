import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JOB_REINDEX_ALL, QUEUE_SEARCH } from '../queue/queue.constants';
import { OptionalAuth, Public, RequirePermissions } from '../rbac/rbac.decorators';
import { SearchIndexStatusDto, SearchQueryDto, SearchResultDto } from '../search/dto/search.dto';
import { SearchQueryService } from './search-query.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchQuery: SearchQueryService,
    @InjectQueue(QUEUE_SEARCH) private readonly queue: Queue,
  ) {}

  @Public()
  @OptionalAuth()
  @Get()
  @ApiOperation({
    summary: 'Search listings',
    description:
      'Typo-tolerant keyword search with category, price, distance and freshness filters. Falls back to a database query if the search index is unavailable — `usedSearchIndex` tells you which path served the response.',
  })
  @ApiResponse({ status: 200, type: SearchResultDto })
  search(
    @Query() query: SearchQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<SearchResultDto> {
    return this.searchQuery.search(query, user?.id);
  }

  @Get('index/status')
  @ApiBearerAuth()
  @RequirePermissions('search:reindex')
  @ApiOperation({
    summary: 'Search index health and drift (admin)',
    description: 'Drift is the gap between published listings and indexed documents.',
  })
  @ApiResponse({ status: 200, type: SearchIndexStatusDto })
  indexStatus(): Promise<SearchIndexStatusDto> {
    return this.searchQuery.indexStatus();
  }

  @Post('index/rebuild')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @RequirePermissions('search:reindex')
  @ApiOperation({
    summary: 'Rebuild the search index from the database (admin)',
    description: 'Always safe: PostgreSQL is the source of truth, so a rebuild cannot lose data.',
  })
  async rebuild(@CurrentUser() user: AuthenticatedUser): Promise<{ queued: boolean }> {
    // One rebuild at a time — a fixed job id makes a double-click a no-op instead of
    // two concurrent full scans.
    await this.queue.add(JOB_REINDEX_ALL, { requestedBy: user.id }, { jobId: 'reindex-all' });
    return { queued: true };
  }
}
