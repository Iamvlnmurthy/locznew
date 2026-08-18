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
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  RequestWithUser,
} from '../common/decorators/current-user.decorator';
import { PaginatedDto } from '../common/dto/pagination.dto';
import { OptionalAuth, Public, RequirePermissions } from '../rbac/rbac.decorators';
import {
  CreateListingDto,
  ListingDetailDto,
  ListingSearchQueryDto,
  ListingStatusChangeDto,
  ListingSummaryDto,
  MyListingsQueryDto,
  UpdateListingDto,
} from './dto/listing.dto';
import { ListingsService } from './listings.service';

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @OptionalAuth()
  @Get()
  @ApiOperation({
    summary: 'Browse and filter listings',
    description:
      'Supply latitude, longitude and radiusKm together for a nearby search; otherwise filtering is by city, locality and category. Signed-in callers also get `isSaved`.',
  })
  @ApiResponse({ status: 200, type: [ListingSummaryDto] })
  search(
    @Query() query: ListingSearchQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<PaginatedDto<ListingSummaryDto>> {
    return this.listings.search(query, user?.id);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The current user’s listings, including drafts and rejections' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MyListingsQueryDto,
  ): Promise<PaginatedDto<ListingSummaryDto>> {
    return this.listings.listMine(user.id, query);
  }

  @Get('saved')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listings the current user has saved' })
  listSaved(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MyListingsQueryDto,
  ): Promise<PaginatedDto<ListingSummaryDto>> {
    return this.listings.listSaved(user.id, query);
  }

  @Get('recently-viewed')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recently viewed listings' })
  recentlyViewed(@CurrentUser() user: AuthenticatedUser): Promise<ListingSummaryDto[]> {
    return this.listings.listRecentlyViewed(user.id);
  }

  @Public()
  @OptionalAuth()
  @Get(':slug')
  @ApiOperation({
    summary: 'Listing detail by slug',
    description:
      'Public — no login required. The owner’s phone appears only if they chose to show it.',
  })
  @ApiResponse({ status: 200, type: ListingDetailDto })
  getBySlug(
    @Param('slug') slug: string,
    @Req() request: RequestWithUser,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<ListingDetailDto> {
    // The address is only used to count a signed-out reader once per hour; it is never
    // stored against the listing.
    return this.listings.getBySlug(slug, user?.id, request.ip);
  }

  @Post()
  @ApiBearerAuth()
  @RequirePermissions('listing:create')
  @ApiOperation({
    summary: 'Create a listing',
    description:
      'Posting is free. Unless `saveAsDraft` is set, the listing is screened immediately and comes back either PUBLISHED or PENDING_REVIEW.',
  })
  @ApiResponse({ status: 201, type: ListingDetailDto })
  create(
    @Body() dto: CreateListingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestWithUser,
  ): Promise<ListingDetailDto> {
    return this.listings.create(user.id, user.roles, dto, {
      ip: request.ip,
      correlationId: request.correlationId,
    });
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a listing',
    description:
      'Editing the title or description of a published listing sends it back through moderation.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListingDetailDto> {
    return this.listings.update(id, user.id, dto);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a draft for review' })
  submit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListingDetailDto> {
    return this.listings.submitForReview(id, user.id, user.roles);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hide a listing without deleting it' })
  async pause(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListingStatusChangeDto> {
    const listing = await this.listings.pause(id, user.id);
    return { id: listing.id, status: listing.status };
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Make a paused listing visible again' })
  async resume(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListingStatusChangeDto> {
    const listing = await this.listings.resume(id, user.id);
    return { id: listing.id, status: listing.status };
  }

  @Post(':id/sold')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark an item as sold' })
  async markSold(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListingStatusChangeDto> {
    const listing = await this.listings.markSold(id, user.id);
    return { id: listing.id, status: listing.status };
  }

  @Post(':id/republish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Republish an expired, sold or paused listing' })
  republish(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListingDetailDto> {
    return this.listings.republish(id, user.id, user.roles);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a listing',
    description:
      'Soft delete — the record is retained so moderation and conversation history stay coherent.',
  })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.listings.remove(id, user.id);
  }

  @Post(':id/save')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @RequirePermissions('listing:save')
  @ApiOperation({ summary: 'Save a listing' })
  save(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ saved: boolean; saveCount: number }> {
    return this.listings.save(id, user.id);
  }

  @Delete(':id/save')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a listing from saved items' })
  unsave(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ saved: boolean; saveCount: number }> {
    return this.listings.unsave(id, user.id);
  }
}
