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
import { PasswordResetService } from './password-reset.service';
import {
  AuthSessionDto,
  ConfirmPhoneDto,
  EmailLoginDto,
  PhoneLoginDto,
  RegisterDto,
  OtpRequestedDto,
  RefreshTokenDto,
  RequestOtpDto,
  VerifyOtpDto,
  GoogleLoginDto,
  RequestPasswordResetDto,
  CheckPasswordResetDto,
  CompletePasswordResetDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

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
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  // Tighter than login: registration writes a row and hashes a password, so it is the more
  // expensive endpoint to abuse, and nobody legitimately creates accounts in bulk.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Create an account with a mobile number and password',
    description:
      'The mobile number is not treated as verified — no SMS has proved the person holds it. ' +
      'Verification is a separate step once an SMS provider is configured.',
  })
  @ApiResponse({ status: 201, type: AuthSessionDto })
  @ApiResponse({ status: 409, description: 'That mobile number already has an account' })
  register(@Body() dto: RegisterDto, @Req() request: RequestWithUser): Promise<AuthSessionDto> {
    return this.auth.register(dto, this.contextOf(request));
  }

  @Post('phone/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Confirm your mobile number with a Firebase verification',
    description:
      'The device verifies the number with Firebase and sends the resulting ID token here. ' +
      'A confirmed number is what lets it count towards claiming a business — matching an ' +
      'unconfirmed one against a public directory proves only that you can read.',
  })
  @ApiResponse({ status: 200, description: 'The number is now confirmed on your account' })
  @ApiResponse({ status: 409, description: 'That number is already on another account' })
  confirmPhone(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmPhoneDto,
  ): Promise<{ phoneE164: string }> {
    return this.auth.confirmPhone(user.id, dto.idToken);
  }

  @Public()
  @Post('login/email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Sign in with an email address and password',
    description:
      'The ordinary way in. Email rather than the mobile number, because signing in must not ' +
      'depend on an SMS arriving. The number is still identity and contact.',
  })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  @ApiResponse({ status: 401, description: 'Incorrect email or password' })
  loginWithEmail(
    @Body() dto: EmailLoginDto,
    @Req() request: RequestWithUser,
  ): Promise<AuthSessionDto> {
    return this.auth.loginWithEmail(dto, this.contextOf(request));
  }

  @Public()
  @Post('login/phone')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with a mobile number and password' })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  @ApiResponse({ status: 401, description: 'Incorrect mobile number or password' })
  loginWithPhone(
    @Body() dto: PhoneLoginDto,
    @Req() request: RequestWithUser,
  ): Promise<AuthSessionDto> {
    return this.auth.loginWithPhone(dto, this.contextOf(request));
  }

  @Public()
  @Post('password/reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Ask for a password reset link',
    description:
      'Always answers the same way, whether or not the address has an account. A form that ' +
      'said "no such user" would be an account enumeration tool, and on a marketplace that ' +
      'means learning who trades here.',
  })
  @ApiResponse({ status: 202 })
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Req() request: RequestWithUser,
  ): Promise<{ accepted: true }> {
    await this.passwordReset.request(dto.email, this.contextOf(request).ip);
    return { accepted: true };
  }

  @Public()
  @Post('password/reset/check')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Whether a reset link can still be used',
    description:
      'Lets the form say a link has expired before somebody types a new password rather ' +
      'than after. Answers only yes or no, never why.',
  })
  async checkPasswordReset(
    // POST with the token in the body, not GET with it in the query string.
    //
    // A reset token is a live credential for the account. In a URL it lands in the access
    // log of every proxy it passes, in the browser's history, and — because the page that
    // calls this also links to the terms and safety pages — in the `Referer` sent to
    // whatever is clicked next. None of that is true of a request body.
    @Body() dto: CheckPasswordResetDto,
  ): Promise<{ usable: boolean }> {
    return { usable: await this.passwordReset.isUsable(dto.token) };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Set a new password using a reset link',
    description:
      'Signs every session out. If the password was changed because somebody else had it, ' +
      'leaving their session alive would make the reset pointless.',
  })
  async completePasswordReset(@Body() dto: CompletePasswordResetDto): Promise<{ reset: true }> {
    await this.passwordReset.complete(dto.token, dto.password);
    return { reset: true };
  }

  @Public()
  @Post('login/google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Sign in with Google',
    description:
      'Send the ID token Google issued. It is verified against Google signature, audience ' +
      'and issuer here — nothing the client asserts about identity is trusted. An account ' +
      'is created on first sign-in, and linked to an existing one only when Google reports ' +
      'the email address as verified.',
  })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  loginWithGoogle(
    @Body() dto: GoogleLoginDto,
    @Req() request: RequestWithUser,
  ): Promise<AuthSessionDto> {
    return this.auth.loginWithGoogle(dto, this.contextOf(request));
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
