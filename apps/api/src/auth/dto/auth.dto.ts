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

export class EmailLoginDto {
  @ApiProperty({ example: 'admin@locz.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'LocZ@dev1234' })
  @IsString()
  @Length(8, 128)
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
  @ApiProperty() phone!: string;
  @ApiPropertyOptional() email?: string | null;
  @ApiProperty() displayName!: string;
  @ApiProperty() preferredLanguage!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiProperty({ description: 'True when the account was created by this request' })
  isNewUser!: boolean;
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
