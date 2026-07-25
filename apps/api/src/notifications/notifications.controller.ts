import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginatedDto } from '../common/dto/pagination.dto';
import {
  NotificationDto,
  NotificationPreferenceDto,
  NotificationQueryDto,
  UpdateNotificationPreferenceDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Notification centre' })
  @ApiResponse({ status: 200, type: [NotificationDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ): Promise<PaginatedDto<NotificationDto>> {
    return this.notifications.list(user.id, query.page, query.limit, query.unreadOnly ?? false);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread count for the badge' })
  async unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark one notification as read' })
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark everything as read' })
  markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<{ updated: number }> {
    return this.notifications.markAllRead(user.id);
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'Notification preferences',
    description: 'Returns the full type × channel matrix with platform defaults applied.',
  })
  @ApiResponse({ status: 200, type: [NotificationPreferenceDto] })
  listPreferences(@CurrentUser() user: AuthenticatedUser): Promise<NotificationPreferenceDto[]> {
    return this.notifications.listPreferences(user.id);
  }

  @Put('preferences')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Turn one notification type and channel on or off' })
  setPreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPreferenceDto,
  ): Promise<void> {
    return this.notifications.setPreference(user.id, dto.type, dto.channel, dto.enabled);
  }
}
