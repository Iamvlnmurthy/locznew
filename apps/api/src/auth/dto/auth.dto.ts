import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatform } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Indian mobile numbers in E.164. Kept strict — a malformed number wastes an SMS. */
const E164_INDIA = /^\+91[6-9]\d{9}$/;

export class DeviceInfoDto {
  @ApiProperty({
    example: 'a3f1c8d2-9c1a-4a5e-8f1b-2f0c6d3e7a11',
    description: 'Stable per-install identifier',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceKey!: string;

  @ApiProperty({ enum: DevicePlatform, example: DevicePlatform.ANDROID })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @ApiPropertyOptional({ example: 'Pixel 7a' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Android 15' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  osVersion?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  appVersion?: string;

  @ApiPropertyOptional({ description: 'FCM registration token' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  pushToken?: string;
}

export class RequestOtpDto {
  @ApiProperty({ example: '+919876543210', description: 'Mobile number in E.164 format' })
  @Matches(E164_INDIA, { message: 'Enter a valid Indian mobile number, for example +919876543210' })
  phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+919876543210' })
  @Matches(E164_INDIA, { message: 'Enter a valid Indian mobile number, for example +919876543210' })
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8)
  code!: string;

  @ApiProperty({ type: DeviceInfoDto })
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  device!: DeviceInfoDto;

  @ApiPropertyOptional({
    example: 'Anitha',
    description: 'Display name, used only when creating the account',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}

/**
 * Minimum password length.
 *
 * Eight, matching the existing email login, rather than something longer. A marketplace
 * used on shared and low-end phones in three languages pays a real cost for a rule people
 * cannot satisfy: they write the password down, or reuse one. The protection that actually
 * matters here is the lockout on repeated failures, which applies per identifier.
 */
const PASSWORD_MIN = 8;

export class ConfirmPhoneDto {
  @ApiProperty({
    description:
      'The ID token Firebase returned after the device verified the number. Its signature, ' +
      'audience and issuer are all checked — an unverified assertion is what the field ' +
      'already held.',
  })
  @IsString()
  @Length(20, 4096)
  idToken!: string;
}

export class RegisterDto {
  @ApiProperty({
    example: 'anjali@example.com',
    description:
      'How you sign in. Email rather than the mobile number, because signing in must not ' +
      'depend on an SMS that may not arrive.',
  })
  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;

  @ApiProperty({
    example: '+919876543210',
    description:
      'Mobile number in E.164 format. Kept for identity and for buyers to reach a seller, ' +
      'not used to sign in.',
  })
  @Matches(E164_INDIA, { message: 'Enter a valid Indian mobile number, for example +919876543210' })
  phone!: string;

  @ApiProperty({ example: 'Anjali Rao' })
  @IsString()
  @Length(2, 80)
  displayName!: string;

  @ApiProperty({ example: 'a strong passphrase', minLength: PASSWORD_MIN })
  @IsString()
  @Length(PASSWORD_MIN, 128)
  password!: string;

  @ApiProperty({ type: DeviceInfoDto })
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  device!: DeviceInfoDto;

  @ApiPropertyOptional({
    example: '3a2a472a-6ea5-4148-9c60-8451f28b49e1',
    description: 'City UUID selected during sign-up',
  })
  @IsOptional()
  @IsString()
  cityId?: string;
}

export class EmailLoginDto {
  @ApiProperty({ example: 'anjali@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  email!: string;

  @ApiProperty({ example: 'a strong passphrase' })
  @IsString()
  @Length(PASSWORD_MIN, 128)
  password!: string;

  @ApiProperty({ type: DeviceInfoDto })
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  device!: DeviceInfoDto;
}

/**
 * Signing in with the mobile number.
 *
 * Kept working alongside email. Every account created before email was collected has only a
 * number, and removing this would lock those people out of accounts they can still reach.
 */
export class PhoneLoginDto {
  @ApiProperty({ example: '+919876543210' })
  @Matches(E164_INDIA, { message: 'Enter a valid Indian mobile number, for example +919876543210' })
  phone!: string;

  @ApiProperty({ example: 'a strong passphrase' })
  @IsString()
  @Length(PASSWORD_MIN, 128)
  password!: string;

  @ApiProperty({ type: DeviceInfoDto })
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  device!: DeviceInfoDto;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Omit to log out of the current session only' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class AuthUserDto {
  @ApiProperty() id!: string;
  /**
   * Null on an account Google created, until the person confirms a number.
   *
   * Clients must not treat this as "no phone needed" — see `requiresPhone`, which is the
   * field to branch on, so a client never has to infer intent from an absent value.
   */
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional() email?: string | null;
  @ApiProperty() displayName!: string;
  @ApiProperty() preferredLanguage!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiProperty({ description: 'True when the account was created by this request' })
  isNewUser!: boolean;
  @ApiProperty({
    description:
      'True when the account has no confirmed mobile number and should be sent to /account/phone',
  })
  requiresPhone!: boolean;
}

export class AuthTokensDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ example: '15m' }) accessTokenExpiresIn!: string;
  @ApiProperty() refreshTokenExpiresAt!: Date;
}

export class AuthSessionDto {
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto;
  @ApiProperty({ type: AuthTokensDto }) tokens!: AuthTokensDto;
}

export class OtpRequestedDto {
  @ApiProperty({ example: 300 }) expiresInSeconds!: number;
  @ApiPropertyOptional({
    description: 'Returned only by the mock provider in non-production environments',
  })
  debugCode?: string;
}

export class GoogleLoginDto {
  @ApiProperty({
    description:
      'The ID token Google issued to your app. Verified here against Google signature, ' +
      'audience and issuer — nothing the client asserts about identity is trusted.',
  })
  @IsString()
  @Length(20, 4096)
  idToken!: string;

  @ApiProperty({ type: DeviceInfoDto })
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  device!: DeviceInfoDto;
}

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'you@example.com' })
  @IsEmail()
  email!: string;
}

export class CompletePasswordResetDto {
  @ApiProperty({ description: 'The token from the emailed link' })
  @IsString()
  @Length(20, 200)
  token!: string;

  @ApiProperty({ minLength: PASSWORD_MIN })
  @IsString()
  @Length(PASSWORD_MIN, 128)
  password!: string;
}
