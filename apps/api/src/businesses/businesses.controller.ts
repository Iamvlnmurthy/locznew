import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginatedDto } from '../common/dto/pagination.dto';
import { OptionalAuth, Public, RequirePermissions } from '../rbac/rbac.decorators';
import { BusinessesService } from './businesses.service';
import {
  AddStaffDto,
  BusinessDetailDto,
  BusinessNearbyQueryDto,
  BusinessSearchQueryDto,
  BusinessStaffDto,
  BusinessSummaryDto,
  CreateBusinessDto,
  SetVerificationDto,
  UpdateBusinessDto,
} from './dto/business.dto';

@ApiTags('businesses')
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Browse active local businesses' })
  @ApiResponse({ status: 200, type: [BusinessSummaryDto] })
  listPublic(@Query() query: BusinessSearchQueryDto): Promise<PaginatedDto<BusinessSummaryDto>> {
    return this.businesses.listPublic(query);
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Distinct business categories with live counts (for hub pages)' })
  businessCategories(): Promise<Array<{ id: string; slug: string; name: string; count: number }>> {
    return this.businesses.businessCategories();
  }

  @Public()
  @Get('category-counts')
  @ApiOperation({ summary: 'Active business count per category for an area (for tile badges)' })
  categoryCounts(
    @Query('cityId') cityId?: string,
    @Query('pincode') pincode?: string,
  ): Promise<Array<{ categoryId: string; count: number }>> {
    return this.businesses.categoryCounts({ cityId, pincode });
  }

  @Public()
  @Get('sitemap-count')
  @ApiOperation({ summary: 'Curated business count for sharding the XML sitemap' })
  async sitemapCount(): Promise<{ total: number }> {
    return { total: await this.businesses.sitemapCount() };
  }

  @Public()
  @Get('service-areas/sitemap-count')
  @ApiOperation({ summary: 'Count of service-area SEO pages (category+locality, >=5 providers)' })
  async serviceAreaSitemapCount(): Promise<{ total: number }> {
    return { total: await this.businesses.serviceAreaSitemapCount() };
  }

  @Public()
  @Get('service-areas/sitemap')
  @ApiOperation({
    summary: 'A page of {categorySlug, localitySlug} service-area pairs for the sitemap',
  })
  async serviceAreaSitemap(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('category') category?: string,
  ): Promise<{ areas: Array<{ categorySlug: string; localitySlug: string }> }> {
    const size = Math.min(10000, Math.max(1, Number(pageSize) || 10000));
    const p = Math.max(0, Number(page) || 0);
    return { areas: await this.businesses.serviceAreaSitemapPage(p, size, category) };
  }

  @Public()
  @Get('sitemap-shard-cursors')
  @ApiOperation({ summary: 'First id of each XML sitemap shard, for keyset pagination' })
  async sitemapShardCursors(
    @Query('shardSize') shardSize?: string,
  ): Promise<{ cursors: string[] }> {
    const size = Math.min(50000, Math.max(1, Number(shardSize) || 10000));
    return { cursors: await this.businesses.sitemapShardCursors(size) };
  }

  @Public()
  @Get('sitemap-slugs')
  @ApiOperation({ summary: 'A page of business slugs for the XML sitemap (curated set)' })
  sitemapSlugs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('from') from?: string,
  ): Promise<{ slugs: Array<{ slug: string; updatedAt: Date }> }> {
    const size = Math.min(50000, Math.max(1, Number(pageSize) || 50000));
    // Keyset (`from`) is O(shard size) at any depth; OFFSET (`page`) is kept for back-compat.
    if (from) return this.businesses.sitemapSlugsFrom(from, size);
    const p = Math.max(0, Number(page) || 0);
    return this.businesses.sitemapSlugs(p, size);
  }

  @Public()
  @Get('nearby')
  @ApiOperation({ summary: 'Businesses nearest to a point, with an exact distance on each' })
  @ApiResponse({ status: 200, type: [BusinessSummaryDto] })
  nearby(@Query() query: BusinessNearbyQueryDto): Promise<PaginatedDto<BusinessSummaryDto>> {
    return this.businesses.nearby({
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm: query.radiusKm,
      pincode: query.pincode,
      categoryId: query.categoryId,
      area: query.area,
      q: query.q,
      verifiedOnly: query.verifiedOnly,
      page: query.page,
      limit: query.limit,
      skip: query.skip,
      lang: query.lang,
    });
  }

  @Post()
  @ApiBearerAuth()
  @RequirePermissions('business:create')
  @ApiOperation({
    summary: 'Register a business',
    description:
      'Free and immediate — no approval step. Verification is a separate signal an administrator grants later.',
  })
  @ApiResponse({ status: 201, type: BusinessDetailDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBusinessDto,
  ): Promise<BusinessDetailDto> {
    return this.businesses.create(user.id, dto);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Businesses this user owns or works for' })
  @ApiResponse({ status: 200, type: [BusinessSummaryDto] })
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<BusinessSummaryDto[]> {
    return this.businesses.listMine(user.id);
  }

  @Public()
  @OptionalAuth()
  @Get(':slug')
  @ApiOperation({ summary: 'Public business profile' })
  @ApiResponse({ status: 200, type: BusinessDetailDto })
  getBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Query('lang') lang?: string,
  ): Promise<BusinessDetailDto> {
    return this.businesses.getBySlug(slug, user?.id, lang);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a business',
    description:
      'Changing the name, phone or address of a verified business returns it to pending.',
  })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateBusinessDto,
  ): Promise<BusinessDetailDto> {
    return this.businesses.update(id, user.id, dto);
  }

  @Get(':id/staff')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Staff on a business' })
  @ApiResponse({ status: 200, type: [BusinessStaffDto] })
  listStaff(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BusinessStaffDto[]> {
    return this.businesses.listStaff(id, user.id);
  }

  @Post(':id/staff')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add a staff member by phone number',
    description: 'They must already have a LocZ account — this never sends an SMS invitation.',
  })
  @ApiResponse({ status: 201, type: BusinessStaffDto })
  addStaff(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddStaffDto,
  ): Promise<BusinessStaffDto> {
    return this.businesses.addStaff(id, user.id, dto);
  }

  @Delete(':id/staff/:staffId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a staff member' })
  removeStaff(
    @Param('id') id: string,
    @Param('staffId') staffId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.businesses.removeStaff(id, user.id, staffId);
  }

  @Post(':id/verification-request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request administrator verification for an owned business',
    description:
      'Requires a description, address, phone number and opening hours. Repeated pending requests are rejected.',
  })
  requestVerification(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.businesses.requestVerification(id, user.id);
  }

  @Post(':id/verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @RequirePermissions('business:verify')
  @ApiOperation({ summary: 'Set verification status (admin)' })
  setVerification(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SetVerificationDto,
  ): Promise<void> {
    return this.businesses.setVerification(id, user.id, body.status, body.note);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a business',
    description: 'Soft delete. Its listings are archived so none is left pointing at nothing.',
  })
  delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.businesses.delete(id, user.id);
  }
}
