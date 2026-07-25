import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AuthenticatedUser,
  CurrentUser,
  RequestWithUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../rbac/rbac.decorators';
import { AuthService, RequestContext } from './auth.service';
import {
  AuthSessionDto,
  EmailLoginDto,
  OtpRequestedDto,
  RefreshTokenDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private contextOf(request: RequestWithUser): RequestContext {
    return {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.correlationId,
    };
  }

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  // A second brake in front of the OTP service's own limits: this one is per-IP and
  // rejects floods before any database work happens.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Request a login code by SMS',
    description:
      'In development (OTP_PROVIDER=mock) the code is returned as `debugCode` so the flow can be completed without an SMS gateway.',
  })
  @ApiResponse({ status: 200, type: OtpRequestedDto })
  @ApiResponse({ status: 429, description: 'Too many code requests' })
  requestOtp(
    @Body() dto: RequestOtpDto,
    @Req() request: RequestWithUser,
  ): Promise<OtpRequestedDto> {
    return this.auth.requestOtp(dto, this.contextOf(request));
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Verify a login code',
    description:
      'Creates the account on first successful verification. There is no separate sign-up.',
  })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  @ApiResponse({ status: 400, description: 'Incorrect or expired code' })
  @ApiResponse({ status: 403, description: 'Locked out after repeated failures' })
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() request: RequestWithUser): Promise<AuthSessionDto> {
    return this.auth.verifyOtp(dto, this.contextOf(request));
  }

  @Public()
  @Post('login/email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Optional email and password sign-in' })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  loginWithEmail(
    @Body() dto: EmailLoginDto,
    @Req() request: RequestWithUser,
  ): Promise<AuthSessionDto> {
    return this.auth.loginWithEmail(dto, this.contextOf(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new token pair',
    description:
      'Refresh tokens rotate on every use. Presenting an already-rotated token revokes the entire session family.',
  })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  refresh(@Body() dto: RefreshTokenDto, @Req() request: RequestWithUser): Promise<AuthSessionDto> {
    return this.auth.refresh(dto.refreshToken, this.contextOf(request));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out of the current device' })
  logout(@CurrentUser() user: AuthenticatedUser, @Req() request: RequestWithUser): Promise<void> {
    return this.auth.logoutCurrentDevice(user.id, user.sessionId, this.contextOf(request));
  }

  @Post('logout/all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out of every device' })
  logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestWithUser,
  ): Promise<{ revokedSessions: number }> {
    return this.auth.logoutAllDevices(user.id, this.contextOf(request));
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The identity behind the current access token' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
