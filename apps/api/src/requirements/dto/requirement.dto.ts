import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequirementResponseKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RespondToRequirementDto {
  @ApiProperty({
    enum: RequirementResponseKind,
    description:
      'Real answers are conditional. "Can arrange" and "made to order" are the common cases, ' +
      'and collapsing them into yes/no loses the condition the buyer decides on.',
  })
  @IsEnum(RequirementResponseKind)
  kind!: RequirementResponseKind;

  @ApiPropertyOptional({ example: 1400, description: 'When it differs from the buyer budget' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offeredPrice?: number;

  @ApiPropertyOptional({ description: 'For can-arrange, made-to-order and available-later' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  availableFrom?: Date;

  @ApiPropertyOptional({ maxLength: 500, description: 'A short note, not a conversation' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({ description: 'Your own listing, when you have exactly this' })
  @IsOptional()
  @IsUUID()
  offeredListingId?: string;

  @ApiPropertyOptional({ description: 'Answer as a business you own or work for' })
  @IsOptional()
  @IsUUID()
  businessId?: string;
}

export class OpenRequirementChatDto {
  @ApiProperty({ example: 'Is it still available?' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}

export class MarkRequirementFulfilledDto {
  @ApiProperty({ description: 'False reopens a requirement closed by mistake' })
  @IsBoolean()
  fulfilled!: boolean;
}

export class RequirementResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() listingId!: string;
  @ApiProperty() responderId!: string;
  @ApiPropertyOptional() businessId!: string | null;
  @ApiProperty({ enum: RequirementResponseKind }) kind!: RequirementResponseKind;
  @ApiPropertyOptional() offeredPrice!: number | null;
  @ApiPropertyOptional() availableFrom!: Date | null;
  @ApiPropertyOptional() message!: string | null;
  @ApiPropertyOptional() offeredListingId!: string | null;
  @ApiPropertyOptional({ description: 'Set once the buyer opens a chat with this seller' })
  conversationId!: string | null;
  @ApiProperty() createdAt!: Date;
}
