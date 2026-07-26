import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';
import { OtpProvider, OtpSendResult } from './otp-provider.interface';

interface TwilioMessageResponse {
  sid?: string;
  message?: string;
}

const purposeLabels: Record<string, string> = {
  LOGIN: 'sign-in',
  PHONE_CHANGE: 'phone-number change',
  DELETE_CONFIRM: 'account deletion',
};

/**
 * Twilio Programmable Messaging adapter.
 *
 * Production deployments should use a restricted API key and secret. An account
 * Auth Token remains supported for backwards compatibility and local verification.
 */
@Injectable()
export class TwilioOtpProvider implements OtpProvider {
  readonly name = 'twilio';
  private readonly logger = new Logger(TwilioOtpProvider.name);

  constructor(private readonly config: AppConfig) {}

  async send(phoneE164: string, code: string, purpose: string): Promise<OtpSendResult> {
    const accountSid = this.config.get('TWILIO_ACCOUNT_SID');
    const apiKeySid = this.config.get('TWILIO_API_KEY_SID');
    const apiKeySecret = this.config.get('TWILIO_API_KEY_SECRET');
    const authToken = this.config.get('TWILIO_AUTH_TOKEN');
    const from = this.config.get('TWILIO_FROM_NUMBER');
    const username = apiKeySid || accountSid;
    const password = apiKeySecret || authToken;

    if (!accountSid || !username || !password || !from) {
      throw new InternalServerErrorException(
        'Twilio is selected as the OTP provider but its credentials are incomplete',
      );
    }

    const body = new URLSearchParams({
      To: phoneE164,
      From: from,
      Body: `Your LocZ ${purposeLabels[purpose] ?? 'verification'} code is ${code}. It expires soon. Do not share this code.`,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    const responseBody = (await response.json().catch(() => ({}))) as TwilioMessageResponse;
    if (!response.ok || !responseBody.sid) {
      this.logger.error(
        `Twilio rejected the send for ${this.maskPhone(phoneE164)}: HTTP ${response.status}`,
      );
      throw new InternalServerErrorException(
        'Could not send the verification code. Please try again.',
      );
    }

    return { messageId: responseBody.sid };
  }

  private maskPhone(phoneE164: string): string {
    return phoneE164.length > 4 ? `${phoneE164.slice(0, 4)}****${phoneE164.slice(-2)}` : '****';
  }
}
