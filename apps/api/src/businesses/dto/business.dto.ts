import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BusinessType, VerificationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
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

const INDIAN_PHONE = /^\+91[6-9]\d{9}$/;

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
  @ApiPropertyOptional() logoUrl!: string | null;
  @ApiProperty({ enum: VerificationStatus }) verificationStatus!: VerificationStatus;
  @ApiProperty() listingCount!: number;
  @ApiProperty() viewCount!: number;
  @ApiPropertyOptional() description!: string | null;
  @ApiPropertyOptional() addressLine!: string | null;
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
  @ApiPropertyOptional() latitude!: number | null;
  @ApiPropertyOptional() longitude!: number | null;
  @ApiPropertyOptional() primaryPhone!: string | null;
  @ApiPropertyOptional() whatsappNumber!: string | null;
  @ApiPropertyOptional() email!: string | null;
  @ApiPropertyOptional() website!: string | null;
  @ApiProperty() isOwner!: boolean;
  @ApiProperty() createdAt!: Date;
}
