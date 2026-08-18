import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuth, Public, RequirePermissions } from '../rbac/rbac.decorators';
import { CreateUploadUrlDto, MediaDto, ReorderMediaDto, UploadUrlDto } from './dto/media.dto';
import { MediaService } from './media.service';

@ApiTags('media')
@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('listings/:listingId/media/upload-url')
  @ApiBearerAuth()
  @RequirePermissions('media:upload')
  @ApiOperation({
    summary: 'Request a signed upload URL',
    description:
      'Step 1 of 2. PUT the file to `uploadUrl` with exactly the Content-Type you declared, then call the confirm endpoint.',
  })
  @ApiResponse({ status: 201, type: UploadUrlDto })
  createUploadUrl(
    @Param('listingId') listingId: string,
    @Body() dto: CreateUploadUrlDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UploadUrlDto> {
    return this.media.createUploadUrl(listingId, user.id, dto);
  }

  @Post('media/:mediaId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm an upload and generate renditions',
    description:
      'Step 2 of 2. Validates the real file type, strips metadata, applies EXIF orientation and produces thumb/card/full WebP renditions.',
  })
  @ApiResponse({ status: 200, type: MediaDto })
  confirm(
    @Param('mediaId') mediaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MediaDto> {
    return this.media.confirmUpload(mediaId, user.id);
  }

  @Public()
  @OptionalAuth()
  @Get('listings/:listingId/media')
  @ApiOperation({
    summary: 'Images on a listing',
    description:
      'Public for a published listing. A draft or rejected listing returns its images only to ' +
      'its owner — the listing itself is not public until it is published, and neither are its ' +
      'photographs.',
  })
  @ApiResponse({ status: 200, type: [MediaDto] })
  list(
    @Param('listingId') listingId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<MediaDto[]> {
    return this.media.listForListing(listingId, user?.id);
  }

  @Put('listings/:listingId/media/order')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reorder images — the first becomes the cover photo' })
  @ApiResponse({ status: 200, type: [MediaDto] })
  reorder(
    @Param('listingId') listingId: string,
    @Body() dto: ReorderMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MediaDto[]> {
    return this.media.reorder(listingId, user.id, dto.mediaIds);
  }

  @Delete('media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an image and its renditions' })
  delete(@Param('mediaId') mediaId: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.media.delete(mediaId, user.id);
  }
}
