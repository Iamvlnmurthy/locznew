import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationContext } from '@prisma/client';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class StartConversationDto {
  @ApiPropertyOptional({ description: 'Required for a listing or job enquiry' })
  @IsOptional()
  @IsUUID()
  listingId?: string;

  @ApiPropertyOptional({ description: 'Required for a business enquiry' })
  @IsOptional()
  @IsUUID()
  businessId?: string;

  @ApiProperty({ example: 'Is this still available?' })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  message!: string;
}

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class ConversationSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ConversationContext }) context!: ConversationContext;
  @ApiPropertyOptional() listingId!: string | null;
  @ApiPropertyOptional() listingTitle!: string | null;
  @ApiPropertyOptional() listingThumbUrl!: string | null;
  @ApiProperty() otherPartyId!: string;
  @ApiProperty() otherPartyName!: string;
  @ApiPropertyOptional() lastMessagePreview!: string | null;
  @ApiPropertyOptional() lastMessageAt!: Date | null;
  @ApiProperty() unreadCount!: number;
  @ApiProperty({ description: 'True when this user started the thread' }) isInitiator!: boolean;
}

export class MessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() senderId!: string;
  @ApiProperty() body!: string;
  @ApiProperty() isMine!: boolean;
  @ApiPropertyOptional() readAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class ConversationDetailDto extends ConversationSummaryDto {
  @ApiProperty({ type: [MessageDto] }) messages!: MessageDto[];
}

export class ConversationQueryDto extends PaginationQueryDto {}

export class BlockUserDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
