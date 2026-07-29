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
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  RequestWithUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../rbac/rbac.decorators';
import {
  DeleteAccountRequestDto,
  DeviceDto,
  UpdateProfileDto,
  UpdatePushTokenDto,
  UserProfileDto,
} from './dto/user.dto';
import { UsersService } from './users.service';
import { SellerProfileService } from './seller-profile.service';
import { SellerProfileDto } from './dto/seller-profile.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly sellerProfiles: SellerProfileService,
  ) {}

  @Public()
  @Get(':id/profile')
  @ApiOperation({
    summary: 'What LocZ can honestly say about a seller',
    description:
      'Derived from what the platform observed, never from what the seller typed. Carries no ' +
      'phone and no email: a number published on one listing stays on that listing.',
  })
  @ApiResponse({ status: 200, type: SellerProfileDto })
  getSellerProfile(@Param('id') id: string): Promise<SellerProfileDto> {
    return this.sellerProfiles.get(id);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user profile' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    return this.users.getProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
    @Req() request: RequestWithUser,
  ): Promise<UserProfileDto> {
    return this.users.updateProfile(user.id, dto, {
      ip: request.ip,
      correlationId: request.correlationId,
    });
  }

  @Get('me/devices')
  @ApiOperation({ summary: 'Devices signed in to this account' })
  @ApiResponse({ status: 200, type: [DeviceDto] })
  getDevices(@CurrentUser() user: AuthenticatedUser): Promise<DeviceDto[]> {
    return this.users.listDevices(user.id, user.sessionId);
  }

  @Delete('me/devices/:deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out one device and forget its push token' })
  revokeDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    return this.users.revokeDevice(user.id, deviceId);
  }

  @Post('me/push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Register or refresh this device’s push token',
    description: 'Called on every app launch — Firebase rotates tokens without warning.',
  })
  updatePushToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePushTokenDto,
  ): Promise<void> {
    return this.users.updatePushToken(user.id, dto.deviceKey, dto.pushToken);
  }

  @Post('me/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deactivate the account',
    description:
      'Reversible. Published listings are paused; signing in again restores the account.',
  })
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestWithUser,
  ): Promise<void> {
    return this.users.deactivate(user.id, { ip: request.ip });
  }

  @Post('me/delete-request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Request account deletion',
    description:
      'Archives the account and its listings. Records are anonymised after the retention window rather than deleted immediately, so moderation and dispute history survives.',
  })
  requestDeletion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountRequestDto,
    @Req() request: RequestWithUser,
  ): Promise<void> {
    return this.users.requestDeletion(user.id, dto.reason, { ip: request.ip });
  }
}
