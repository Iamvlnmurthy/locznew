import { Module } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';
import { MockOtpProvider } from './mock-otp.provider';
import { Msg91OtpProvider } from './msg91-otp.provider';
import { OTP_PROVIDER, OtpProvider } from './otp-provider.interface';
import { OtpService } from './otp.service';
import { TwilioOtpProvider } from './twilio-otp.provider';

/**
 * The single binding point for SMS delivery (ADR: OTP abstraction).
 */
@Module({
  providers: [
    MockOtpProvider,
    Msg91OtpProvider,
    TwilioOtpProvider,
    {
      provide: OTP_PROVIDER,
      useFactory: (
        config: AppConfig,
        mock: MockOtpProvider,
        msg91: Msg91OtpProvider,
        twilio: TwilioOtpProvider,
      ): OtpProvider => {
        switch (config.get('OTP_PROVIDER')) {
          case 'msg91':
            return msg91;
          case 'twilio':
            return twilio;
          case 'mock':
          default:
            return mock;
        }
      },
      inject: [AppConfig, MockOtpProvider, Msg91OtpProvider, TwilioOtpProvider],
    },
    OtpService,
  ],
  exports: [OtpService],
})
export class OtpModule {}
