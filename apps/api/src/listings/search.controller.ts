import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JOB_REINDEX_ALL, QUEUE_SEARCH } from '../queue/queue.constants';
import { OptionalAuth, Public, RequirePermissions } from '../rbac/rbac.decorators';
import { SearchIndexStatusDto, SearchQueryDto, SearchResultDto } from '../search/dto/search.dto';
import { SearchQueryService } from './search-query.service';
import { BusinessSearchService } from '../search/business-search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchQuery: SearchQueryService,
    @InjectQueue(QUEUE_SEARCH) private readonly queue: Queue,
    private readonly businessSearch: BusinessSearchService,
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

  @Get('businesses')
  @Public()
  @ApiOperation({
    summary: 'Search businesses on their own, paged',
    description:
      'The mixed search returns six businesses beside the listings, which suits a first ' +
      'glance and not browsing. This pages through the rest without re-running the listing ' +
      'search, so a strip can load more as somebody swipes.',
  })
  businesses(
    @Query() query: SearchQueryDto,
    @Query('businessPage') businessPage?: string,
    @Query('businessLimit') businessLimit?: string,
  ): Promise<{ businesses: unknown[]; businessTotal: number }> {
    // Clamped rather than trusted. An unbounded limit on a term matching 30,000 shops is a
    // slow query somebody can ask for by editing a URL.
    const page = Math.max(1, Number.parseInt(businessPage ?? '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(businessLimit ?? '10', 10) || 10));
    return this.searchQuery.searchBusinesses(query, page, limit);
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

  @Post('index/businesses/rebuild')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @RequirePermissions('search:reindex')
  @ApiOperation({
    summary: 'Rebuild the business search index from the database (admin)',
    description:
      'Separate from the listing index on purpose: four million businesses would dilute ' +
      'relevance for every listing query, and results are grouped by kind. Always safe — ' +
      'PostgreSQL is the source of truth.',
  })
  rebuildBusinesses(): Promise<{ indexed: number }> {
    // Inline rather than queued: this is an operator pressing a button and waiting for an
    // answer, and a silent queue is how a rebuild once appeared to succeed while leaving the
    // index empty.
    return this.businessSearch.reindexAll();
  }

  @Get('index/businesses/status')
  @ApiBearerAuth()
  @RequirePermissions('search:reindex')
  @ApiOperation({ summary: 'Business index health and drift (admin)' })
  businessIndexStatus() {
    return this.businessSearch.status();
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
    // One rebuild at a time — a fixed job id makes a double-click a no-op instead of two
    // concurrent full scans.
    //
    // Removed on completion *and* on failure, which is the part that was missing: BullMQ
    // keeps finished jobs, so the id stayed taken forever and every rebuild after the
    // first was silently discarded while this endpoint went on reporting `queued: true`.
    // The button an operator presses when search is visibly broken did nothing at all.
    // The id only needs to be reserved while the job is waiting or running.
    await this.queue.add(
      JOB_REINDEX_ALL,
      { requestedBy: user.id },
      { jobId: 'reindex-all', removeOnComplete: true, removeOnFail: true },
    );
    return { queued: true };
  }
}
