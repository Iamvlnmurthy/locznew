import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginatedDto, paginate } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../rbac/rbac.decorators';
import {
  ApproveListingDto,
  ModerationQueueItemDto,
  ModerationQueueQueryDto,
  RejectListingDto,
} from './dto/moderation.dto';
import { ModerationService } from './moderation.service';

@ApiTags('moderation')
@ApiBearerAuth()
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('queue')
  @RequirePermissions('listing:moderate')
  @ApiOperation({
    summary: 'Listings awaiting review, oldest first',
    description:
      'Each item carries the automated reasons that flagged it, so a moderator sees why.',
  })
  @ApiResponse({ status: 200, type: [ModerationQueueItemDto] })
  async getQueue(
    @Query() query: ModerationQueueQueryDto,
  ): Promise<PaginatedDto<ModerationQueueItemDto>> {
    const { items, total } = await this.moderation.getQueue(query.page, query.limit);
    return paginate(items, total, query.page, query.limit);
  }

  @Post('listings/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('listing:moderate')
  @ApiOperation({ summary: 'Publish a listing from the queue' })
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveListingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: string; status: string }> {
    const listing = await this.moderation.approveListing(id, user.id, dto.note);
    return { id: listing.id, status: listing.status };
  }

  @Post('listings/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('listing:moderate')
  @ApiOperation({
    summary: 'Reject a listing',
    description:
      'The reason is shown to the poster, so it must be written for them, not for internal notes.',
  })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectListingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: string; status: string }> {
    const listing = await this.moderation.rejectListing(id, user.id, dto.reason);
    return { id: listing.id, status: listing.status };
  }

  @Post('listings/:id/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('listing:moderate')
  @ApiOperation({ summary: 'Remove a listing that is already published' })
  remove(
    @Param('id') id: string,
    @Body() dto: RejectListingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.moderation.removeListing(id, user.id, dto.reason);
  }
}
