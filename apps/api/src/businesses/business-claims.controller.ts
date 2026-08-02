import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessScale, ClaimReviewStatus, OfferingType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  Min,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginatedDto, PaginationQueryDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../rbac/rbac.decorators';
import { BusinessClaimsService } from './business-claims.service';

const INDIAN_PHONE = /^\+91[6-9]\d{9}$/;

export class CreateClaimDto {
  @ApiProperty({
    example: 'I have run this shop since 2015. The GST certificate is in my name.',
    description: 'How the claimant is connected to the business, in their own words',
  })
  @IsString()
  @MinLength(20, {
    message: 'Tell us how you are connected to this business — a line or two is enough.',
  })
  @MaxLength(1000)
  evidence!: string;

  @ApiProperty({
    enum: BusinessScale,
    description:
      "What the business actually is. An imported record's details were inferred from map " +
      'data and are often wrong; the owner is the first person able to correct them.',
  })
  @IsEnum(BusinessScale)
  scale!: BusinessScale;

  @ApiProperty({ enum: OfferingType })
  @IsEnum(OfferingType)
  offering!: OfferingType;

  @ApiPropertyOptional({
    description:
      'The right category, if the imported one is wrong. Applied only when the claim is ' +
      'approved — an unreviewed claim must not be able to rewrite a live record.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Where the claimant is standing. Sent with the device accuracy, which is checked: a ' +
      'fix accurate to two kilometres that centres nearby proves nothing.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Device-reported accuracy radius, in metres.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  locationAccuracyM?: number;

  @ApiPropertyOptional({
    example: '+919876543210',
    description: 'A number a reviewer can ring. Never shown publicly.',
  })
  @IsOptional()
  @Matches(INDIAN_PHONE, { message: 'Enter a valid Indian phone number in E.164 format' })
  contactPhone?: string;
}

export class RejectClaimDto {
  @ApiProperty({ example: 'The phone number given does not match the one on the listing.' })
  @IsString()
  @MinLength(5)
  @MaxLength(400)
  reason!: string;
}

export class ClaimQueueQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ClaimReviewStatus, default: ClaimReviewStatus.PENDING })
  @IsOptional()
  @IsEnum(ClaimReviewStatus)
  status?: ClaimReviewStatus;
}

/**
 * Claiming an imported business.
 *
 * Separate from BusinessesController because the audience is different: everything here is
 * either a person asking for something they do not yet have, or a reviewer deciding. Nothing
 * on these routes is public — an open list of unclaimed businesses and who wants them is a
 * map for anybody planning to impersonate a shop.
 */
export class MatchQueryDto {
  @ApiProperty({ example: 'Sri Lakshmi Kirana' })
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLatitude() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsLongitude() longitude?: number;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() cityId?: string;
}

@ApiTags('business-claims')
@Controller('businesses')
export class BusinessClaimsController {
  constructor(private readonly claims: BusinessClaimsService) {}

  @Post(':id/claims')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ask to take over an imported business',
    description:
      'Reviewed by a person, not granted on the spot. Approving a claim hands over the ' +
      "business's listings, enquiries and identity in search.",
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') businessId: string,
    @Body() dto: CreateClaimDto,
  ): Promise<{ id: string; status: ClaimReviewStatus }> {
    return this.claims.create(user.id, businessId, dto);
  }

  @Get('claims/possible-matches')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Imported records that look like the business you are about to create',
    description:
      'A shopkeeper whose shop is already in the directory has no way to know that. Left ' +
      'alone they create a second record and their real shop stays unclaimed with the search ' +
      'traffic. Suggestion only — nothing is created or merged, and it can be ignored.',
  })
  possibleMatches(@Query() query: MatchQueryDto): Promise<unknown> {
    return this.claims.findPossibleMatches(query);
  }

  @Get('claims/mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Claims you have filed, and where each one stands' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedDto<unknown>> {
    return this.claims.listMine(user.id, query.page, query.limit);
  }

  @Post('claims/:claimId/withdraw')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Withdraw your own claim while it is still pending' })
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId') claimId: string,
  ): Promise<void> {
    return this.claims.withdraw(user.id, claimId);
  }

  @Get('claims/queue')
  @ApiBearerAuth()
  @RequirePermissions('business:verify')
  @ApiOperation({
    summary: 'The claim review queue (admin)',
    description: 'Oldest first — a claim nobody looks at is a shop that never joins.',
  })
  queue(@Query() query: ClaimQueueQueryDto): Promise<PaginatedDto<unknown>> {
    return this.claims.listForReview(
      query.status ?? ClaimReviewStatus.PENDING,
      query.page,
      query.limit,
    );
  }

  @Post('claims/:claimId/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @RequirePermissions('business:verify')
  @ApiOperation({ summary: 'Approve a claim and hand the business over (admin)' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId') claimId: string,
  ): Promise<void> {
    return this.claims.approve(user.id, claimId);
  }

  @Post('claims/:claimId/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @RequirePermissions('business:verify')
  @ApiOperation({
    summary: 'Refuse a claim, with a reason (admin)',
    description:
      'The reason reaches the claimant. A rejection nobody can explain cannot be appealed.',
  })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId') claimId: string,
    @Body() dto: RejectClaimDto,
  ): Promise<void> {
    return this.claims.reject(user.id, claimId, dto.reason);
  }
}
