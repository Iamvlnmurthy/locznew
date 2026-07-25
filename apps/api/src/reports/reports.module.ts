import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ModerationModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
