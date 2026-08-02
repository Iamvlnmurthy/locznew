import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaSafetyAccessAction, MediaSafetyCaseStatus, MediaStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ModerationQueueQueryDto extends PaginationQueryDto {}

export class ModerationQueueItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() type!: string;
  @ApiProperty() ownerId!: string;
  @ApiProperty() ownerName!: string;
  @ApiProperty({ description: 'Listings this owner already has published' })
  ownerPublishedCount!: number;
  @ApiProperty() cityName!: string;
  @ApiProperty() categoryName!: string;
  @ApiPropertyOptional() price!: number | null;
  @ApiPropertyOptional() moderationScore!: number | null;
  @ApiProperty({ type: [String], description: 'Why the automated pass flagged this listing' })
  systemReasons!: string[];
  @ApiProperty() imageCount!: number;
  @ApiProperty() reportCount!: number;
  @ApiProperty() createdAt!: Date;
}

/**
 * One quarantined image waiting for a person.
 *
 * Carries no image content and no signed URL. A moderator opening an item asks
 * `GET moderation/media/:id/preview` for a short-lived one, so listing the queue does not
 * mint a URL for every quarantined image on the page — most of which nobody will look at,
 * and each of which would be a live link to unreviewed content.
 */
export class ModerationMediaQueueItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() listingId!: string;
  @ApiProperty() listingTitle!: string;
  @ApiProperty() uploaderName!: string;
  @ApiPropertyOptional({
    description: 'What the automated pass said, in the words shown to the uploader',
  })
  failureReason!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class ApproveListingDto {
  @ApiPropertyOptional({ example: 'Checked images, genuine listing' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectListingDto {
  @ApiProperty({ example: 'Contact details in the description instead of the contact fields' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class SuspendUserDto {
  @ApiProperty({
    example: 'Repeated fake listings after two warnings',
    description: 'Recorded in the audit trail — the reason is what makes the action reviewable',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    example: 7,
    description:
      'Days to suspend for. Omit for indefinite — but most suspensions should not be: a fortnight is a correction, a permanent ban for a first offence is a decision to lose a user rather than teach one.',
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays?: number;
}

export class BlockImageDto {
  @ApiProperty({
    example: 'Photograph of ivory carving, listed as an antique bangle',
    description: 'Shown to the uploader if they try again, so it has to say something useful',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  reason!: string;

  @ApiPropertyOptional({
    example: 'WILDLIFE',
    description:
      'Matches the banned-keyword categories, so image and text refusals report together',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;
}

export class SafetyEvidenceAccessDto {
  @ApiProperty({
    example: 'Verify provider match before statutory report 2026-07-26/04',
    description:
      'Written to the restricted access log before a preview URL is issued. Never include image details.',
  })
  @IsString()
  @MinLength(15)
  @MaxLength(500)
  justification!: string;
}

export class ReportSafetyCaseDto {
  @ApiProperty({
    example: 'REPORT-2026-07-26-004',
    description:
      'Opaque acknowledgement from the approved reporting channel. Do not include image details.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  reportReference!: string;

  @ApiProperty({
    example: 'Submitted by the named safety officer through the approved reporting channel',
    description: 'Recorded in the restricted case access log.',
  })
  @IsString()
  @MinLength(15)
  @MaxLength(500)
  justification!: string;
}

export class ResolveSafetyCaseDto {
  @ApiProperty({
    example: 'Confirmed false positive after the approved specialist review',
    description:
      'Recorded in the restricted case access log. Never include image details or provider hashes.',
  })
  @IsString()
  @MinLength(15)
  @MaxLength(500)
  justification!: string;
}

export class SafetyCaseAccessLogDto {
  @ApiProperty() id!: string;
  @ApiProperty() actorId!: string;
  @ApiProperty({ enum: MediaSafetyAccessAction }) action!: MediaSafetyAccessAction;
  @ApiProperty() justification!: string;
  @ApiProperty() createdAt!: Date;
}

export class SafetyCaseDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() mediaId!: string;
  @ApiProperty() listingId!: string;
  @ApiProperty({ enum: MediaSafetyCaseStatus }) status!: MediaSafetyCaseStatus;
  @ApiProperty({ enum: MediaStatus }) mediaStatus!: MediaStatus;
  @ApiProperty() provider!: string;
  @ApiPropertyOptional({ nullable: true }) providerReference!: string | null;
  @ApiProperty() reasonCode!: string;
  @ApiPropertyOptional({ nullable: true }) reportReference!: string | null;
  @ApiPropertyOptional({ nullable: true }) resolutionNote!: string | null;
  @ApiProperty() openedAt!: Date;
  @ApiPropertyOptional({ nullable: true }) reportedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) releasedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) closedAt!: Date | null;
  @ApiProperty({ type: [SafetyCaseAccessLogDto] })
  accessHistory!: SafetyCaseAccessLogDto[];
}
