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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VerificationStatus } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginatedDto } from '../common/dto/pagination.dto';
import { OptionalAuth, Public, RequirePermissions } from '../rbac/rbac.decorators';
import { BusinessesService } from './businesses.service';
import {
  AddStaffDto,
  BusinessDetailDto,
  BusinessNearbyQueryDto,
  BusinessSearchQueryDto,
  BusinessStaffDto,
  BusinessSummaryDto,
  CreateBusinessDto,
  UpdateBusinessDto,
} from './dto/business.dto';

@ApiTags('businesses')
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Browse active local businesses' })
  @ApiResponse({ status: 200, type: [BusinessSummaryDto] })
  listPublic(@Query() query: BusinessSearchQueryDto): Promise<PaginatedDto<BusinessSummaryDto>> {
    return this.businesses.listPublic(query);
  }

  @Public()
  @Get('category-counts')
  @ApiOperation({ summary: 'Active business count per category for an area (for tile badges)' })
  categoryCounts(
    @Query('cityId') cityId?: string,
    @Query('pincode') pincode?: string,
  ): Promise<Array<{ categoryId: string; count: number }>> {
    return this.businesses.categoryCounts({ cityId, pincode });
  }

  @Public()
  @Get('nearby')
  @ApiOperation({ summary: 'Businesses nearest to a point, with an exact distance on each' })
  @ApiResponse({ status: 200, type: [BusinessSummaryDto] })
  nearby(@Query() query: BusinessNearbyQueryDto): Promise<PaginatedDto<BusinessSummaryDto>> {
    return this.businesses.nearby({
      latitude: query.latitude,
      longitude: query.longitude,
      radiusKm: query.radiusKm,
      pincode: query.pincode,
      categoryId: query.categoryId,
      q: query.q,
      page: query.page,
      limit: query.limit,
      skip: query.skip,
    });
  }

  @Post()
  @ApiBearerAuth()
  @RequirePermissions('business:create')
  @ApiOperation({
    summary: 'Register a business',
    description:
      'Free and immediate — no approval step. Verification is a separate signal an administrator grants later.',
  })
  @ApiResponse({ status: 201, type: BusinessDetailDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBusinessDto,
  ): Promise<BusinessDetailDto> {
    return this.businesses.create(user.id, dto);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Businesses this user owns or works for' })
  @ApiResponse({ status: 200, type: [BusinessSummaryDto] })
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<BusinessSummaryDto[]> {
    return this.businesses.listMine(user.id);
  }

  @Public()
  @OptionalAuth()
  @Get(':slug')
  @ApiOperation({ summary: 'Public business profile' })
  @ApiResponse({ status: 200, type: BusinessDetailDto })
  getBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<BusinessDetailDto> {
    return this.businesses.getBySlug(slug, user?.id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a business',
    description:
      'Changing the name, phone or address of a verified business returns it to pending.',
  })
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateBusinessDto,
  ): Promise<BusinessDetailDto> {
    return this.businesses.update(id, user.id, dto);
  }

  @Get(':id/staff')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Staff on a business' })
  @ApiResponse({ status: 200, type: [BusinessStaffDto] })
  listStaff(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BusinessStaffDto[]> {
    return this.businesses.listStaff(id, user.id);
  }

  @Post(':id/staff')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add a staff member by phone number',
    description: 'They must already have a LocZ account — this never sends an SMS invitation.',
  })
  @ApiResponse({ status: 201, type: BusinessStaffDto })
  addStaff(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddStaffDto,
  ): Promise<BusinessStaffDto> {
    return this.businesses.addStaff(id, user.id, dto);
  }

  @Delete(':id/staff/:staffId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a staff member' })
  removeStaff(
    @Param('id') id: string,
    @Param('staffId') staffId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.businesses.removeStaff(id, user.id, staffId);
  }

  @Post(':id/verification-request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request administrator verification for an owned business',
    description:
      'Requires a description, address, phone number and opening hours. Repeated pending requests are rejected.',
  })
  requestVerification(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.businesses.requestVerification(id, user.id);
  }

  @Post(':id/verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @RequirePermissions('business:verify')
  @ApiOperation({ summary: 'Set verification status (admin)' })
  setVerification(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { status: VerificationStatus; note?: string },
  ): Promise<void> {
    return this.businesses.setVerification(id, user.id, body.status, body.note);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a business',
    description: 'Soft delete. Its listings are archived so none is left pointing at nothing.',
  })
  delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.businesses.delete(id, user.id);
  }
}
