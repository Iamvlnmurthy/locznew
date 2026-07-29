import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import {
  SavedSearchDto,
  SaveSearchDto,
  SetSavedSearchActiveDto,
} from './dto/search-subscription.dto';
import { SearchSubscriptionsService } from './search-subscriptions.service';

@ApiTags('saved-searches')
@ApiBearerAuth()
@Controller('saved-searches')
export class SearchSubscriptionsController {
  constructor(private readonly subscriptions: SearchSubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Searches this user has saved' })
  @ApiResponse({ status: 200, type: [SavedSearchDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<SavedSearchDto[]> {
    return this.subscriptions.list(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Save a search and be told when a new listing answers it',
    description:
      'Alerts arrive when a listing is first published, not when one is resumed or ' +
      'republished — an alert should mean the listing is new.',
  })
  @ApiResponse({ status: 201, type: SavedSearchDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveSearchDto,
  ): Promise<SavedSearchDto> {
    return this.subscriptions.create(user.id, dto);
  }

  @Put(':id/active')
  @ApiOperation({ summary: 'Pause or resume alerts without losing the search' })
  @ApiResponse({ status: 200, type: SavedSearchDto })
  setActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetSavedSearchActiveDto,
  ): Promise<SavedSearchDto> {
    return this.subscriptions.setActive(user.id, id, dto.isActive);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Forget a saved search' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.subscriptions.remove(user.id, id);
  }
}
