import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [QueueModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
