import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuth, Public } from '../rbac/rbac.decorators';
import { FeedDto, FeedQueryDto } from './dto/feed.dto';
import { FeedService } from './feed.service';

@ApiTags('feed')
@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Public()
  @OptionalAuth()
  @Get()
  @ApiOperation({
    summary: 'Location-aware home feed',
    description:
      'Works signed out. Signed-in callers additionally get "Recommended for you" and "Recently viewed". Empty sections are omitted.',
  })
  @ApiResponse({ status: 200, type: FeedDto })
  getFeed(@Query() query: FeedQueryDto, @CurrentUser() user?: AuthenticatedUser): Promise<FeedDto> {
    return this.feed.getFeed(query, user?.id);
  }
}
