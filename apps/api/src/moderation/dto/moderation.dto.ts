import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
