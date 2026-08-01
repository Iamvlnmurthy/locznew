import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { RequirementsController } from './requirements.controller';
import { RequirementsProcessor } from './requirements.processor';
import { RequirementsService } from './requirements.service';

@Module({
  imports: [ConversationsModule],
  controllers: [RequirementsController],
  providers: [RequirementsService, RequirementsProcessor],
  exports: [RequirementsService],
})
export class RequirementsModule {}
