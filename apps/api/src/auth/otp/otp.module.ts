import { Module } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';
import { MockOtpProvider } from './mock-otp.provider';
import { Msg91OtpProvider } from './msg91-otp.provider';
import { OTP_PROVIDER, OtpProvider } from './otp-provider.interface';
import { OtpService } from './otp.service';

/**
 * The single binding point for SMS delivery (ADR: OTP abstraction). Adding Twilio
 * means implementing OtpProvider and adding a case here.
 */
@Module({
  providers: [
    MockOtpProvider,
    Msg91OtpProvider,
    {
      provide: OTP_PROVIDER,
      useFactory: (
        config: AppConfig,
        mock: MockOtpProvider,
        msg91: Msg91OtpProvider,
      ): OtpProvider => {
        switch (config.get('OTP_PROVIDER')) {
          case 'msg91':
            return msg91;
          case 'twilio':
            throw new Error(
              'OTP_PROVIDER=twilio is configured but no Twilio provider is implemented yet',
            );
          case 'mock':
          default:
            return mock;
        }
      },
      inject: [AppConfig, MockOtpProvider, Msg91OtpProvider],
    },
    OtpService,
  ],
  exports: [OtpService],
})
export class OtpModule {}
