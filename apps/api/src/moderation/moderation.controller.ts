import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MediaSafetyCaseStatus } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginatedDto, paginate } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../rbac/rbac.decorators';
import {
  ApproveListingDto,
  ModerationQueueItemDto,
  ModerationQueueQueryDto,
  RejectListingDto,
  BlockImageDto,
  ReportSafetyCaseDto,
  ResolveSafetyCaseDto,
  SafetyCaseDetailDto,
  SafetyEvidenceAccessDto,
  SuspendUserDto,
} from './dto/moderation.dto';
import { ImageModerationService } from '../media/image-moderation.service';
import { MediaSafetyService } from '../media/media-safety.service';
import { MediaService } from '../media/media.service';
import { ModerationService } from './moderation.service';

@ApiTags('moderation')
@ApiBearerAuth()
@Controller('moderation')
export class ModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly images: ImageModerationService,
    private readonly media: MediaService,
    private readonly mediaSafety: MediaSafetyService,
  ) {}

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
    // A listing cannot enter search until every reviewed rendition has been promoted.
    await this.media.approveForListing(id);
    const listing = await this.moderation.approveListing(id, user.id, dto.note);
    return { id: listing.id, status: listing.status };
  }

  @Get('media/:id/preview')
  @RequirePermissions('listing:moderate')
  @ApiOperation({
    summary: 'Create a short-lived private preview for an image awaiting review',
  })
  moderationPreview(@Param('id') id: string): Promise<{ url: string; expiresInSeconds: number }> {
    return this.media.moderationPreview(id);
  }

  @Get('safety/cases')
  @RequirePermissions('safety:case:read')
  @ApiOperation({
    summary: 'Restricted child-safety case queue without image content',
  })
  safetyCases(): ReturnType<MediaSafetyService['listOpenCases']> {
    return this.mediaSafety.listOpenCases();
  }

  @Get('safety/cases/:id')
  @RequirePermissions('safety:case:read')
  @ApiOperation({
    summary: 'Restricted safety-case metadata and prior access history',
    description:
      'Returns no image, storage key, hash, or URL. Viewing the detail is itself recorded in the restricted audit log.',
  })
  @ApiResponse({ status: 200, type: SafetyCaseDetailDto })
  safetyCaseDetail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SafetyCaseDetailDto> {
    return this.mediaSafety.getCaseDetail(id, user.id);
  }

  @Post('safety/cases/:id/evidence-preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety:evidence:read')
  @ApiOperation({
    summary: 'Issue an audited, short-lived preview for held evidence',
    description:
      'Not available to ordinary moderators. The justification is recorded before storage signs the URL.',
  })
  safetyEvidencePreview(
    @Param('id') id: string,
    @Body() dto: SafetyEvidenceAccessDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    return this.mediaSafety.evidencePreview(id, user.id, dto.justification);
  }

  @Post('safety/cases/:id/report')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety:case:report')
  @ApiOperation({
    summary: 'Record a safety case as reported through the approved channel',
    description:
      'Only an open case can be reported. The external acknowledgement and actor justification are retained as restricted metadata.',
  })
  reportSafetyCase(
    @Param('id') id: string,
    @Body() dto: ReportSafetyCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: string; status: MediaSafetyCaseStatus }> {
    return this.mediaSafety.markReported(id, user.id, dto.reportReference, dto.justification);
  }

  @Post('safety/cases/:id/release')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety:case:release')
  @ApiOperation({
    summary: 'Release a false-positive hold back to ordinary human review',
    description:
      'Does not publish the image or listing. The quarantined media returns to REVIEW_REQUIRED.',
  })
  releaseSafetyCase(
    @Param('id') id: string,
    @Body() dto: ResolveSafetyCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: string; status: MediaSafetyCaseStatus }> {
    return this.mediaSafety.releaseHold(id, user.id, dto.justification);
  }

  @Post('safety/cases/:id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('safety:case:close')
  @ApiOperation({
    summary: 'Close a reported safety case while preserving its legal hold',
    description: 'Closing ends active handling; it does not delete evidence or release held media.',
  })
  closeSafetyCase(
    @Param('id') id: string,
    @Body() dto: ResolveSafetyCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: string; status: MediaSafetyCaseStatus }> {
    return this.mediaSafety.closeCase(id, user.id, dto.justification);
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

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('user:suspend')
  @ApiOperation({
    summary: 'Suspend an account',
    description:
      'Takes effect immediately: every session is revoked, so the account cannot keep acting on a token it already holds. Listings are left alone, because hiding the content of an account is a separate decision with its own trail.',
  })
  @ApiResponse({ status: 200, description: 'Account suspended' })
  suspendUser(
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ suspended: true; sessionsRevoked: number; endsAt: Date | null }> {
    return this.moderation.suspendUser(id, user.id, dto.reason, dto.durationDays);
  }

  @Post('users/:id/reinstate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('user:suspend')
  @ApiOperation({
    summary: 'Lift a suspension',
    description: 'The account signs in again; revoked sessions are not restored.',
  })
  reinstateUser(
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.moderation.reinstateUser(id, user.id, dto.reason);
  }

  @Post('media/:id/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('listing:moderate')
  @ApiOperation({
    summary: 'Publish a quarantined image a moderator has accepted',
    description:
      'The counterpart to block, which existed on its own — leaving the only route out of ' +
      'quarantine the automated scanner, so an unreachable scanner trapped every upload.',
  })
  approveMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') mediaId: string,
  ): Promise<void> {
    return this.media.releaseFromQuarantine(mediaId, user.id);
  }

  @Post('media/:id/block')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('listing:moderate')
  @ApiOperation({
    summary: 'Refuse this image from now on',
    description:
      'Removing a listing does not stop the same photograph being uploaded again a minute later. Blocking records both an exact and a perceptual hash, so a re-crop or a re-save of the same picture is refused too.',
  })
  @ApiResponse({ status: 200, description: 'Image blocked' })
  blockImage(
    @Param('id') id: string,
    @Body() dto: BlockImageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ blocked: number }> {
    return this.images.blockImage(id, user.id, dto.reason, dto.category);
  }
}
