import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { MODERATION_PROVIDER } from './moderation-provider.interface';
import { RuleBasedModerationProvider } from './rule-based-moderation.provider';

/**
 * Single binding point for automated moderation (ADR-0008). Replacing the rules engine
 * with an AI provider means changing `useExisting` here and nothing else.
 */
@Module({
  controllers: [ModerationController],
  providers: [
    RuleBasedModerationProvider,
    { provide: MODERATION_PROVIDER, useExisting: RuleBasedModerationProvider },
    ModerationService,
  ],
  exports: [ModerationService],
})
export class ModerationModule {}
