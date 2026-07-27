import { Module } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';
import { MockOtpProvider } from './mock-otp.provider';
import { PinOtpProvider } from './pin-otp.provider';
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
    PinOtpProvider,
    Msg91OtpProvider,
    TwilioOtpProvider,
    {
      provide: OTP_PROVIDER,
      useFactory: (
        config: AppConfig,
        mock: MockOtpProvider,
        pin: PinOtpProvider,
        msg91: Msg91OtpProvider,
        twilio: TwilioOtpProvider,
      ): OtpProvider => {
        switch (config.get('OTP_PROVIDER')) {
          case 'msg91':
            return msg91;
          case 'twilio':
            return twilio;
          case 'pin':
            return pin;
          case 'mock':
          default:
            return mock;
        }
      },
      inject: [AppConfig, MockOtpProvider, PinOtpProvider, Msg91OtpProvider, TwilioOtpProvider],
    },
    OtpService,
  ],
  exports: [OtpService],
})
export class OtpModule {}
