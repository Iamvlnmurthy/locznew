import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from '@prisma/client';
import { RequirePermissions } from '../rbac/rbac.decorators';
import { DataSourceService, sourceMayRunInProduction } from './data-source.service';
import { CreateDataSourceDto, UpdateDataSourceDto } from './dto/data-source.dto';

/**
 * Admin control plane for the data engine (plan Part 59): registering sources and recording
 * their licence review. Reuses the existing `category:manage` admin permission for now; a
 * dedicated `datasource:manage` permission can be seeded later.
 */
@ApiTags('data-engine')
@ApiBearerAuth()
@Controller('admin/data-sources')
export class DataEngineController {
  constructor(private readonly sources: DataSourceService) {}

  @Get()
  @RequirePermissions('category:manage')
  @ApiOperation({ summary: 'List registered data sources with health and licence status' })
  async list(): Promise<Array<DataSource & { runnable: boolean }>> {
    const all = await this.sources.list();
    return all.map((source) => ({ ...source, runnable: sourceMayRunInProduction(source) }));
  }

  @Post()
  @RequirePermissions('category:manage')
  @ApiOperation({ summary: 'Register a data source (starts disabled and unreviewed)' })
  create(@Body() dto: CreateDataSourceDto): Promise<DataSource> {
    return this.sources.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('category:manage')
  @ApiOperation({ summary: 'Update a source — including recording its licence review' })
  update(@Param('id') id: string, @Body() dto: UpdateDataSourceDto): Promise<DataSource> {
    return this.sources.update(id, dto);
  }
}
