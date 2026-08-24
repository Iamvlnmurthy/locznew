import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../rbac/rbac.decorators';
import { AdminService } from './admin.service';
import { PaginatedDto, paginate } from '../common/dto/pagination.dto';
import {
  AdminMetricsDto,
  AdminUserDto,
  AuditLogDto,
  DemandMetricsDto,
  ListingsByBucketDto,
  QueueHealthDto,
  StorageStatsDto,
  TopListingDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('metrics')
  @RequirePermissions('metrics:read')
  @ApiOperation({ summary: 'Dashboard overview counters' })
  @ApiResponse({ status: 200, type: AdminMetricsDto })
  getMetrics(): Promise<AdminMetricsDto> {
    return this.admin.getMetrics();
  }

  @Get('metrics/listings-by-city')
  @RequirePermissions('metrics:read')
  @ApiOperation({ summary: 'Published listings per city' })
  @ApiResponse({ status: 200, type: [ListingsByBucketDto] })
  listingsByCity(@Query('limit') limit?: string): Promise<ListingsByBucketDto[]> {
    return this.admin.getListingsByCity(limit ? Number(limit) : 10);
  }

  @Get('metrics/listings-by-category')
  @RequirePermissions('metrics:read')
  @ApiOperation({ summary: 'Published listings per category' })
  @ApiResponse({ status: 200, type: [ListingsByBucketDto] })
  listingsByCategory(@Query('limit') limit?: string): Promise<ListingsByBucketDto[]> {
    return this.admin.getListingsByCategory(limit ? Number(limit) : 10);
  }

  @Get('metrics/demand')
  @RequirePermissions('metrics:read')
  @ApiOperation({ summary: 'Buyer-demand counters — open, fulfilled and unanswered requirements' })
  @ApiResponse({ status: 200, type: DemandMetricsDto })
  demand(): Promise<DemandMetricsDto> {
    return this.admin.getDemandMetrics();
  }

  @Get('metrics/unmet-demand')
  @RequirePermissions('metrics:read')
  @ApiOperation({ summary: 'Categories with the most unanswered requirements — the supply gap' })
  @ApiResponse({ status: 200, type: [ListingsByBucketDto] })
  unmetDemand(@Query('limit') limit?: string): Promise<ListingsByBucketDto[]> {
    return this.admin.getUnmetDemandByCategory(limit ? Number(limit) : 10);
  }

  @Get('metrics/daily-listings')
  @RequirePermissions('metrics:read')
  @ApiOperation({ summary: 'Listings created per day, zero-filled' })
  @ApiResponse({ status: 200, type: [ListingsByBucketDto] })
  dailyListings(@Query('days') days?: string): Promise<ListingsByBucketDto[]> {
    return this.admin.getDailyListings(days ? Number(days) : 14);
  }

  @Get('metrics/most-viewed')
  @RequirePermissions('metrics:read')
  @ApiOperation({ summary: 'Most viewed published listings' })
  @ApiResponse({ status: 200, type: [TopListingDto] })
  mostViewed(@Query('limit') limit?: string): Promise<TopListingDto[]> {
    return this.admin.getMostViewedListings(limit ? Number(limit) : 10);
  }

  @Get('users')
  @RequirePermissions('user:manage')
  @ApiOperation({
    summary: 'User directory',
    description: 'Searchable by display name, phone number or email.',
  })
  @ApiResponse({ status: 200, type: [AdminUserDto] })
  async users(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ): Promise<PaginatedDto<AdminUserDto>> {
    const pageNumber = Math.max(1, Number(page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(limit ?? 25) || 25));
    const { items, total } = await this.admin.listUsers(pageNumber, pageSize, q);
    return paginate(items, total, pageNumber, pageSize);
  }

  @Get('audit-logs')
  @RequirePermissions('audit:read')
  @ApiOperation({
    summary: 'Audit trail',
    description:
      'Filter by entityType and entityId to reconstruct everything that happened to one listing or account.',
  })
  @ApiResponse({ status: 200, type: [AuditLogDto] })
  async auditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
  ): Promise<PaginatedDto<AuditLogDto>> {
    const pageNumber = Math.max(1, Number(page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(limit ?? 50) || 50));
    const { items, total } = await this.admin.listAuditLogs(pageNumber, pageSize, {
      entityType,
      entityId,
      actorId,
      action,
    });
    return paginate(items, total, pageNumber, pageSize);
  }

  @Get('queues')
  @RequirePermissions('metrics:read')
  @ApiOperation({
    summary: 'Background queue depth',
    description: 'A growing waiting count is the earliest signal that a worker has stalled.',
  })
  @ApiResponse({ status: 200, type: [QueueHealthDto] })
  queues(): Promise<QueueHealthDto[]> {
    return this.admin.getQueueHealth();
  }

  @Post('jobs/:name/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('job:run')
  @ApiOperation({
    summary: 'Run a maintenance job now (admin)',
    description:
      'Every one of these already runs on a schedule; this only removes the wait. They are idempotent — each re-reads current state rather than trusting its payload — so an early or repeated run is safe.',
  })
  @ApiResponse({ status: 202, description: 'Job queued' })
  runJob(
    @Param('name') name: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ queued: true; job: string }> {
    return this.admin.runJob(name, user.id);
  }

  @Get('storage')
  @RequirePermissions('metrics:read')
  @ApiOperation({ summary: 'Object-storage usage' })
  @ApiResponse({ status: 200, type: StorageStatsDto })
  storage(): Promise<StorageStatsDto> {
    return this.admin.getStorageStats();
  }
}
