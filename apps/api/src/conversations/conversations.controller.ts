import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginatedDto } from '../common/dto/pagination.dto';
import { ConversationsService } from './conversations.service';
import {
  BlockUserDto,
  ConversationDetailDto,
  ConversationQueryDto,
  ConversationSummaryDto,
  MessageDto,
  SendMessageDto,
  StartConversationDto,
} from './dto/conversation.dto';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  @ApiOperation({
    summary: 'Start or continue an enquiry',
    description:
      'One thread per buyer per listing — sending again continues the existing conversation. Contact details are never exchanged automatically.',
  })
  @ApiResponse({ status: 201, type: ConversationDetailDto })
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartConversationDto,
  ): Promise<ConversationDetailDto> {
    return this.conversations.start(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Conversation list, most recent first' })
  @ApiResponse({ status: 200, type: [ConversationSummaryDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ConversationQueryDto,
  ): Promise<PaginatedDto<ConversationSummaryDto>> {
    return this.conversations.list(user.id, query.page, query.limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Total unread messages across all threads' })
  async unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<{ count: number }> {
    return { count: await this.conversations.unreadTotal(user.id) };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One conversation with its messages',
    description: 'Opening a thread marks the other party’s messages as read.',
  })
  @ApiResponse({ status: 200, type: ConversationDetailDto })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ConversationDetailDto> {
    return this.conversations.getDetail(id, user.id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Reply in a conversation' })
  @ApiResponse({ status: 201, type: MessageDto })
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageDto> {
    return this.conversations.sendMessage(id, user.id, dto.body);
  }

  @Post('block')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Block a user',
    description: 'Stops contact in both directions and closes any existing threads.',
  })
  block(@CurrentUser() user: AuthenticatedUser, @Body() dto: BlockUserDto): Promise<void> {
    return this.conversations.block(user.id, dto.userId, dto.reason);
  }
}
