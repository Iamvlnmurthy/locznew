import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentType, ItemCondition, SalaryPeriod, WorkplaceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Type-specific detail payloads.
 *
 * Each maps to one extension table (ADR-0004). They are separate DTOs rather than one
 * union so that Swagger documents the real shape of each listing type, and so a client
 * cannot smuggle salary fields onto a sofa.
 */

export class BuyerRequirementDetailsDto {
  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetMin?: number;

  @ApiPropertyOptional({ example: 20000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetMax?: number;

  @ApiPropertyOptional({ description: 'When it is needed by' })
  @IsOptional()
  @IsDateString()
  requiredBy?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;

  @ApiPropertyOptional({ enum: ItemCondition })
  @IsOptional()
  @IsEnum(ItemCondition)
  preferredCondition?: ItemCondition;
}

export class OfferDetailsDto {
  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @ApiPropertyOptional({ example: 349 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offerPrice?: number;

  @ApiPropertyOptional({ example: 30, description: 'Computed from the prices when omitted' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercentage?: number;

  @ApiPropertyOptional({ example: 'LOCZ30' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;

  @ApiProperty({ description: 'ISO date the offer becomes valid' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ description: 'ISO date the offer expires — offers are time-bound by definition' })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) redemptionInstructions?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) termsAndConditions?: string;

  @ApiPropertyOptional({ description: 'Total redemptions available' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limitedQuantity?: number;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isOnline?: boolean;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isInStore?: boolean;
}

export class JobDetailsDto {
  @ApiProperty({ example: 'Sri Lakshmi Electronics' })
  @IsString()
  @MaxLength(180)
  companyName!: string;

  @ApiProperty({ enum: EmploymentType })
  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @ApiProperty({ enum: WorkplaceType })
  @IsEnum(WorkplaceType)
  workplaceType!: WorkplaceType;

  @ApiPropertyOptional({ example: 18000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salaryMax?: number;

  @ApiPropertyOptional({ enum: SalaryPeriod, default: SalaryPeriod.MONTHLY })
  @IsOptional()
  @IsEnum(SalaryPeriod)
  salaryPeriod?: SalaryPeriod;

  @ApiPropertyOptional({
    default: true,
    description: 'Hidden salaries halve applications — the default is to show it',
  })
  @IsOptional()
  @IsBoolean()
  isSalaryVisible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  experienceMinYears?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  experienceMaxYears?: number;

  @ApiPropertyOptional({ example: 'Intermediate or above' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  educationRequirement?: string;

  @ApiPropertyOptional({ type: [String], example: ['Billing', 'Tally', 'Customer service'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  openings?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString() applicationDeadline?: string;

  @ApiProperty({ enum: ['IN_APP', 'EXTERNAL_LINK', 'WALK_IN', 'PHONE'] })
  @IsString()
  applyMethod!: 'IN_APP' | 'EXTERNAL_LINK' | 'WALK_IN' | 'PHONE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(400)
  externalApplyUrl?: string;

  @ApiPropertyOptional({ example: 'Walk in Mon–Sat, 10am–4pm. Bring a copy of your CV.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  walkInDetails?: string;
}

export class ServiceDetailsDto {
  @ApiPropertyOptional({ example: 'Plumbing' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serviceType?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceFrom?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceTo?: number;

  @ApiPropertyOptional({ example: 'per visit' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  pricingUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  experienceYears?: number;

  @ApiPropertyOptional({ example: 'Mon–Sat, 8am–8pm' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  availability?: string;

  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() servesAtHome?: boolean;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() servesOnline?: boolean;
}

export class RentalDetailsDto {
  @ApiPropertyOptional({ enum: ['ROOM', 'FLAT', 'HOUSE', 'PG', 'SHOP', 'OFFICE'] })
  @IsOptional()
  @IsString()
  propertyType?: string;

  @ApiPropertyOptional({ example: 12000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rentAmount?: number;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  depositAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  bedrooms?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  bathrooms?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) areaSqft?: number;

  @ApiPropertyOptional({ enum: ['UNFURNISHED', 'SEMI', 'FULL'] })
  @IsOptional()
  @IsString()
  furnishing?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString() availableFrom?: string;

  @ApiPropertyOptional({ example: 'Family / Bachelors / Anyone' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  preferredTenant?: string;

  @ApiPropertyOptional({ type: [String], example: ['Lift', 'Parking', '24x7 water'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  amenities?: string[];
}

export class EventDetailsDto {
  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;

  @ApiPropertyOptional({ example: 'Shilpakala Vedika' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  venueName?: string;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isFreeEntry?: boolean;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) ticketPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(400)
  ticketUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(180) organiser?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) capacity?: number;
}
