import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DataEngineController } from './data-engine.controller';
import { DataSourceService } from './data-source.service';
import { OsmOverpassConnector } from './osm-overpass.connector';

/**
 * The LocZ Data Engine — source registry, connector framework and (later) the ingestion
 * pipeline that turns permitted external data into geo-indexed canonical LocZ entities.
 * See docs/DATA_ENGINE_PLAN.md. P1 lands the registry + connector interface; connectors run as
 * scheduled jobs in later phases.
 */
@Module({
  imports: [PrismaModule],
  controllers: [DataEngineController],
  providers: [DataSourceService, OsmOverpassConnector],
  exports: [DataSourceService],
})
export class DataEngineModule {}
