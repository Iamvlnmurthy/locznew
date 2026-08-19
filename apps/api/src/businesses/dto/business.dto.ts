import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  BusinessClaimStatus,
  BusinessScale,
  BusinessType,
  OfferingType,
  VerificationStatus,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { RADIUS_PRESETS_KM } from '../../geo/dto/geo.dto';

const INDIAN_PHONE = /^\+91[6-9]\d{9}$/;

/**
 * How many terms a business may claim.
 *
 * Generous enough for a real kirana shop's actual range, small enough that the field stays a
 * description of the shop rather than a bid for every query on the platform.
 */
export const MAX_BUSINESS_KEYWORDS = 30;

export class BusinessHourDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Sunday' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: '09:30' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Use 24-hour HH:MM' })
  opensAt!: string;

  @ApiProperty({ example: '21:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Use 24-hour HH:MM' })
  closesAt!: string;

  @ApiPropertyOptional({ default: false, description: 'Closed all day' })
  @IsOptional()
  isClosed?: boolean;
}

export class CreateBusinessDto {
  @ApiProperty({ example: 'Sri Lakshmi Electronics' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional({ enum: BusinessType, default: BusinessType.RETAIL_STORE })
  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @ApiProperty({
    enum: BusinessScale,
    description:
      'How big the operation is. Asked rather than inferred: a home baker and a shop with a ' +
      'shutter are found by different searches.',
  })
  @IsEnum(BusinessScale)
  scale!: BusinessScale;

  @ApiProperty({
    enum: OfferingType,
    description:
      'Whether they sell things, do things, or both. Decides what the storefront can offer — ' +
      '"ask if they stock this" is meaningless for an electrician.',
  })
  @IsEnum(OfferingType)
  offering!: OfferingType;

  @ApiProperty()
  @IsUUID()
  categoryId!: string;

  @ApiProperty()
  @IsUUID()
  cityId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description:
      'What this business sells or does, in the words a customer would type — "toor dal", ' +
      '"bed bug spray". Category vocabulary only reaches category level; these reach the shelf.',
    example: ['toor dal', 'weighing machine', 'atta'],
    maxItems: MAX_BUSINESS_KEYWORDS,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_BUSINESS_KEYWORDS, {
    message: `List at most ${MAX_BUSINESS_KEYWORDS} things you sell. A longer list is keyword stuffing, not a shop.`,
  })
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  keywords?: string[];

  @ApiPropertyOptional({ example: 'Shop 12, Road No 36, Jubilee Hills' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLatitude() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLongitude() longitude?: number;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @Matches(INDIAN_PHONE, { message: 'Enter a valid Indian phone number in E.164 format' })
  primaryPhone?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @Matches(INDIAN_PHONE, { message: 'Enter a valid Indian phone number in E.164 format' })
  whatsappNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'https://example.com' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ type: [BusinessHourDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(14)
  @ValidateNested({ each: true })
  @Type(() => BusinessHourDto)
  hours?: BusinessHourDto[];
}

export class UpdateBusinessDto extends PartialType(CreateBusinessDto) {}

export class BusinessNearbyQueryDto extends PaginationQueryDto {
  @ApiProperty() @Type(() => Number) @IsLatitude() latitude!: number;
  @ApiProperty() @Type(() => Number) @IsLongitude() longitude!: number;

  @ApiPropertyOptional({ enum: RADIUS_PRESETS_KM, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  radiusKm?: number;

  @ApiPropertyOptional({ example: '500081' })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'A pincode is exactly six digits' })
  pincode?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) q?: string;

  @ApiPropertyOptional({ description: 'Only businesses LocZ has verified' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  verifiedOnly?: boolean;
}

export class AddStaffDto {
  @ApiProperty({
    example: '+919876543210',
    description: 'The staff member must already have a LocZ account',
  })
  @Matches(INDIAN_PHONE, { message: 'Enter a valid Indian phone number in E.164 format' })
  phone!: string;

  @ApiProperty({ enum: ['MANAGER', 'EDITOR', 'VIEWER'] })
  @IsString()
  role!: 'MANAGER' | 'EDITOR' | 'VIEWER';
}

export class BusinessSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: BusinessType }) businessType!: BusinessType;
  @ApiProperty() categoryName!: string;
  @ApiProperty() cityName!: string;
  @ApiPropertyOptional() pincode!: string | null;
  @ApiPropertyOptional({ description: 'Present only for nearby (geo) queries' })
  distanceMeters?: number;
  @ApiPropertyOptional() logoUrl!: string | null;
  @ApiProperty({ enum: VerificationStatus }) verificationStatus!: VerificationStatus;
  @ApiProperty({ enum: BusinessClaimStatus }) claimStatus!: BusinessClaimStatus;
  @ApiProperty() listingCount!: number;
  @ApiProperty() viewCount!: number;
  @ApiPropertyOptional() description!: string | null;
  @ApiPropertyOptional() addressLine!: string | null;
  @ApiPropertyOptional({ description: 'For a one-tap Directions link on the card' })
  latitude?: number | null;
  @ApiPropertyOptional() longitude?: number | null;
  @ApiProperty({ type: [BusinessHourDto] }) hours!: BusinessHourDto[];
}

export class BusinessSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Business name or description' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  cityId?: string;

  @ApiPropertyOptional({ example: '500081', description: 'Scope to a single pincode' })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'A pincode is exactly six digits' })
  pincode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Only administrator-verified businesses' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  verifiedOnly?: boolean;

  @ApiPropertyOptional({
    enum: VerificationStatus,
    description: 'Filter by verification workflow status',
  })
  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @ApiPropertyOptional({ enum: ['recommended', 'popular', 'newest'] })
  @IsOptional()
  @IsIn(['recommended', 'popular', 'newest'])
  sort: 'recommended' | 'popular' | 'newest' = 'recommended';
}

export class BusinessStaffDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() role!: string;
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiPropertyOptional() acceptedAt!: Date | null;
}

export class BusinessDetailDto extends BusinessSummaryDto {
  /** On the detail response only — a result card has no room for the shelf list. */
  @ApiProperty({ type: [String] }) keywords!: string[];

  @ApiPropertyOptional({
    enum: BusinessScale,
    description: 'Null on an imported record nobody has claimed — nobody may answer for them.',
  })
  scale!: BusinessScale | null;

  @ApiPropertyOptional({ enum: OfferingType })
  offering!: OfferingType | null;

  @ApiProperty({
    description:
      'True when the description was assembled from the record rather than written by the ' +
      'owner. The page must say so: a reader cannot judge a description without knowing who ' +
      'wrote it.',
  })
  descriptionIsGenerated!: boolean;

  @ApiPropertyOptional({
    description:
      'Required under the source licence for imported records — ODbL and CDLA both make ' +
      'attribution travel with the data. Null for anything a person created.',
    example: 'Details from OpenStreetMap, licensed under ODbL 1.0.',
  })
  attribution!: string | null;

  // latitude/longitude are inherited from BusinessSummaryDto.
  @ApiPropertyOptional() primaryPhone!: string | null;
  @ApiPropertyOptional() whatsappNumber!: string | null;
  @ApiPropertyOptional() email!: string | null;
  @ApiPropertyOptional() website!: string | null;
  @ApiProperty() isOwner!: boolean;
  @ApiProperty() createdAt!: Date;
}
