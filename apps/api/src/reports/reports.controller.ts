import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  RequestWithUser,
} from '../common/decorators/current-user.decorator';
import { PaginatedDto } from '../common/dto/pagination.dto';
import { RequirePermissions } from '../rbac/rbac.decorators';
import {
  CreateReportDto,
  ReportCreatedDto,
  ReportDto,
  ReportQueryDto,
  ResolveReportDto,
} from './dto/report.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('listing:report')
  @ApiOperation({
    summary: 'Report a listing, business, user or conversation',
    description:
      'A report never removes anything on its own — it raises a counter and, past a threshold, pulls the content for human review.',
  })
  @ApiResponse({ status: 201, type: ReportCreatedDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportDto,
    @Req() request: RequestWithUser,
  ): Promise<ReportCreatedDto> {
    const id = await this.reports.create(user.id, dto, request.ip);
    return { id, message: 'Thanks — our team will review this.' };
  }

  @Get()
  @RequirePermissions('report:resolve')
  @ApiOperation({ summary: 'Report queue, oldest first (moderators)' })
  @ApiResponse({ status: 200, type: [ReportDto] })
  list(@Query() query: ReportQueryDto): Promise<PaginatedDto<ReportDto>> {
    return this.reports.list(query);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('report:resolve')
  @ApiOperation({
    summary: 'Resolve or dismiss a report',
    description:
      'Resolving closes every open report against the same target and notifies each reporter of the outcome.',
  })
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ResolveReportDto,
  ): Promise<void> {
    return this.reports.resolve(id, user.id, dto);
  }
}
