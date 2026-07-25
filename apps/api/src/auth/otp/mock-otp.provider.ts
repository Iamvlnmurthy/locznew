import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OtpProvider, OtpSendResult } from './otp-provider.interface';

/**
 * Development and test provider. Logs the code and returns it in the response so the
 * full sign-in flow works with no SMS gateway. Configuration validation refuses to
 * boot with OTP_PROVIDER=mock when NODE_ENV=production, so this cannot ship live.
 */
@Injectable()
export class MockOtpProvider implements OtpProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockOtpProvider.name);

  async send(phoneE164: string, code: string, purpose: string): Promise<OtpSendResult> {
    this.logger.log(`[MOCK OTP] ${purpose} code for ${phoneE164}: ${code}`);
    return { messageId: `mock-${randomUUID()}`, debugCode: code };
  }
}
