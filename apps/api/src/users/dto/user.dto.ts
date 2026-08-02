import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatform, Language } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Anitha Reddy' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ example: 'anitha@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Selling gently used electronics in Madhapur.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ enum: Language })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;
}

export class UserProfileDto {
  @ApiProperty() id!: string;
  /** Null on an account created by Google sign-up that has not confirmed a number yet. */
  @ApiProperty({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional() email!: string | null;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional() bio!: string | null;
  @ApiProperty({ enum: Language }) preferredLanguage!: Language;
  @ApiProperty() status!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ description: 'Listings this user has published' }) publishedListingCount!: number;
  @ApiProperty() savedListingCount!: number;
}

export class DeviceDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: DevicePlatform }) platform!: DevicePlatform;
  @ApiPropertyOptional() name!: string | null;
  @ApiPropertyOptional() appVersion!: string | null;
  @ApiProperty() lastSeenAt!: Date;
  @ApiProperty({ description: 'True for the device making this request' }) isCurrent!: boolean;
}

export class UpdatePushTokenDto {
  @ApiProperty({ description: 'The stable per-install device key used at sign-in' })
  @IsString()
  @MaxLength(128)
  deviceKey!: string;

  @ApiProperty({ description: 'FCM registration token' })
  @IsString()
  @MaxLength(512)
  pushToken!: string;
}

export class DeleteAccountRequestDto {
  @ApiPropertyOptional({ example: 'No longer needed' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
