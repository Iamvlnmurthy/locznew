import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';
import { OtpProvider, OtpSendResult } from './otp-provider.interface';

interface Msg91Response {
  type?: string;
  message?: string;
  request_id?: string;
}

/**
 * MSG91 — the common Indian transactional SMS gateway. Credentials come from the
 * environment only; nothing here is hardcoded and nothing is logged.
 */
@Injectable()
export class Msg91OtpProvider implements OtpProvider {
  readonly name = 'msg91';
  private readonly logger = new Logger(Msg91OtpProvider.name);

  constructor(private readonly config: AppConfig) {}

  async send(phoneE164: string, code: string, purpose: string): Promise<OtpSendResult> {
    const authKey = this.config.get('MSG91_AUTH_KEY');
    const templateId = this.config.get('MSG91_TEMPLATE_ID');
    const senderId = this.config.get('MSG91_SENDER_ID');

    if (!authKey || !templateId || !senderId) {
      throw new InternalServerErrorException(
        'MSG91 is selected as the OTP provider but its credentials are incomplete',
      );
    }

    // MSG91 expects the number without the leading '+'.
    const mobile = phoneE164.replace(/^\+/, '');

    const response = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
      body: JSON.stringify({
        template_id: templateId,
        sender: senderId,
        short_url: '0',
        recipients: [{ mobiles: mobile, OTP: code, PURPOSE: purpose }],
      }),
    });

    if (!response.ok) {
      // The code itself is never included in the log line.
      this.logger.error(`MSG91 rejected the send for ${mobile}: HTTP ${response.status}`);
      throw new InternalServerErrorException(
        'Could not send the verification code. Please try again.',
      );
    }

    const body = (await response.json()) as Msg91Response;
    if (body.type && body.type !== 'success') {
      this.logger.error(`MSG91 error for ${mobile}: ${body.message ?? 'unknown'}`);
      throw new InternalServerErrorException(
        'Could not send the verification code. Please try again.',
      );
    }

    return { messageId: body.request_id ?? 'msg91-unknown' };
  }
}
