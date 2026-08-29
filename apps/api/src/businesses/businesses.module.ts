import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BusinessClaimsController } from './business-claims.controller';
import { BusinessClaimsService } from './business-claims.service';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { KeywordTranslationsService } from './keyword-translations.service';
import { BankBranchService } from './bank-branch.service';
import { PostOfficeService } from './post-office.service';

@Module({
  imports: [MediaModule, NotificationsModule, AuditModule],
  // The claims controller is declared first so its literal `claims/...` paths are matched
  // before the businesses controller's `:id` parameter can swallow them.
  controllers: [BusinessClaimsController, BusinessesController],
  providers: [
    BusinessesService,
    BusinessClaimsService,
    KeywordTranslationsService,
    BankBranchService,
    PostOfficeService,
  ],
  exports: [BusinessesService],
})
export class BusinessesModule {}
