import { Module } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import { BrevoEmailProvider } from './brevo-email.provider';
import { EMAIL_PROVIDER } from './email-provider.interface';
import { EmailService } from './email.service';
import { LogEmailProvider } from './log-email.provider';

/**
 * Picks the provider from configuration, the same way OtpModule does.
 *
 * Chosen by whether a key exists rather than by an explicit provider name: there is only one
 * real provider, and a separate `EMAIL_PROVIDER=brevo` setting could disagree with the key
 * being present. One source of truth avoids a deployment that claims to send mail and cannot.
 */
@Module({
  providers: [
    LogEmailProvider,
    BrevoEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      inject: [AppConfig, BrevoEmailProvider, LogEmailProvider],
      useFactory: (config: AppConfig, brevo: BrevoEmailProvider, log: LogEmailProvider) =>
        config.get('BREVO_API_KEY') ? brevo : log,
    },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
