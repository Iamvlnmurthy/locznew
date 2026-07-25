import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NotificationType }) type!: NotificationType;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Deep-link payload: entityType, entityId, route',
  })
  data!: Record<string, unknown>;
  @ApiPropertyOptional() readAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class NotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}

export class NotificationPreferenceDto {
  @ApiProperty({ enum: NotificationType }) type!: NotificationType;
  @ApiProperty({ enum: NotificationChannel }) channel!: NotificationChannel;
  @ApiProperty() enabled!: boolean;
}

export class UpdateNotificationPreferenceDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}
