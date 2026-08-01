import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import {
  MarkRequirementFulfilledDto,
  OpenRequirementChatDto,
  RequirementResponseDto,
  RespondToRequirementDto,
} from './dto/requirement.dto';
import { RequirementsService } from './requirements.service';

@ApiTags('requirements')
@ApiBearerAuth()
@Controller('requirements')
export class RequirementsController {
  constructor(private readonly requirements: RequirementsService) {}

  @Post(':listingId/responses')
  @ApiOperation({
    summary: 'Answer a buyer requirement',
    description:
      'One answer per seller per requirement, enforced by the database. Answering again ' +
      'updates your answer rather than adding a second: a seller whose price changed is not ' +
      'spamming.',
  })
  @ApiResponse({ status: 201, type: RequirementResponseDto })
  respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
    @Body() dto: RespondToRequirementDto,
  ): Promise<RequirementResponseDto> {
    return this.requirements.respond(user.id, listingId, dto);
  }

  @Get(':listingId/responses')
  @ApiOperation({
    summary: 'Answers to a requirement',
    description:
      'The buyer sees every answer. A seller sees only their own, because showing them the ' +
      'competition would turn a buyer requirement into price discovery for sellers.',
  })
  @ApiResponse({ status: 200, type: [RequirementResponseDto] })
  listResponses(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
  ): Promise<RequirementResponseDto[]> {
    return this.requirements.listResponses(listingId, user.id);
  }

  @Delete('responses/:responseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Withdraw your answer' })
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('responseId') responseId: string,
  ): Promise<void> {
    return this.requirements.withdraw(user.id, responseId);
  }

  @Post('responses/:responseId/chat')
  @ApiOperation({ summary: 'Buyer opens a conversation with a seller who answered' })
  async openChat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('responseId') responseId: string,
    @Body() dto: OpenRequirementChatDto,
  ): Promise<{ conversationId: string }> {
    return {
      conversationId: await this.requirements.openConversation(user.id, responseId, dto.message),
    };
  }

  @Put(':listingId/fulfilled')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Close a requirement once the buyer has what they needed',
    description:
      'Kept rather than deleted. A requirement nobody could answer names demand this area ' +
      'could not meet, which is the most valuable thing the platform learns.',
  })
  markFulfilled(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
    @Body() dto: MarkRequirementFulfilledDto,
  ): Promise<void> {
    return this.requirements.markFulfilled(user.id, listingId, dto.fulfilled);
  }
}
