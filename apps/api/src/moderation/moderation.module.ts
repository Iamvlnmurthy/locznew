import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ImageModerationModule } from '../media/image-moderation.module';
import { MediaModule } from '../media/media.module';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { MODERATION_PROVIDER } from './moderation-provider.interface';
import { RuleBasedModerationProvider } from './rule-based-moderation.provider';

/**
 * Single binding point for automated moderation (ADR-0008). Replacing the rules engine
 * with an AI provider means changing `useExisting` here and nothing else.
 */
@Module({
  // forwardRef because auth depends on moderation for posting limits, and moderation now
  // depends on auth to revoke the sessions of a suspended account.
  imports: [forwardRef(() => AuthModule), ImageModerationModule, MediaModule],
  controllers: [ModerationController],
  providers: [
    RuleBasedModerationProvider,
    { provide: MODERATION_PROVIDER, useExisting: RuleBasedModerationProvider },
    ModerationService,
  ],
  exports: [ModerationService],
})
export class ModerationModule {}
