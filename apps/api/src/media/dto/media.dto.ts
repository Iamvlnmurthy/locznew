import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateUploadUrlDto {
  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ example: 842103, description: 'Declared size in bytes; re-checked after upload' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

export class UploadUrlDto {
  @ApiProperty({ description: 'Media record id — send this back to confirm the upload' })
  mediaId!: string;

  @ApiProperty({ description: 'PUT the file bytes here with the exact Content-Type requested' })
  uploadUrl!: string;

  @ApiProperty() storageKey!: string;
  @ApiProperty() expiresInSeconds!: number;
}

export class ConfirmUploadDto {
  @ApiProperty()
  @IsUUID()
  mediaId!: string;
}

export class ReorderMediaDto {
  @ApiProperty({ type: [String], description: 'Media ids in the order they should appear' })
  @IsArray()
  @ArrayMaxSize(12)
  @IsUUID('4', { each: true })
  mediaIds!: string[];
}

export class MediaDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: MediaStatus }) status!: MediaStatus;
  @ApiPropertyOptional({ description: 'Null until processing completes' }) thumbUrl!: string | null;
  @ApiPropertyOptional() cardUrl!: string | null;
  @ApiPropertyOptional() fullUrl!: string | null;
  @ApiPropertyOptional() blurhash!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isPrimary!: boolean;
  @ApiPropertyOptional() failureReason!: string | null;
}

export class MediaPositionDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(11)
  position!: number;
}
