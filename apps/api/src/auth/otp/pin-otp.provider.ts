import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OtpProvider, OtpSendResult } from './otp-provider.interface';

/**
 * A shared PIN instead of a one-time code, for a closed trial with no SMS gateway.
 *
 * The mock provider returns the generated code in the HTTP response so a developer can sign
 * in without an SMS. That is fine on a laptop and unacceptable on anything reachable from
 * the internet — the response literally contains the credential. This provider exists so a
 * trial can be *used* by invited testers without handing every visitor a login.
 *
 * It sends nothing, and deliberately returns no `debugCode`. The PIN is configured once via
 * `OTP_FIXED_CODE` and shared with testers out of band, the way an office door code is.
 *
 * **This is weaker than a one-time code and is not a login mechanism.** A four-digit PIN is
 * ten thousand possibilities, and it is the same for everybody. What keeps it survivable for
 * a closed trial is that nothing else about the flow changes: the existing five-attempt
 * limit, the fifteen-minute lockout, the per-phone request throttle and the code expiry all
 * still apply, so an attacker gets five guesses per phone number before being locked out.
 *
 * Configuration validation refuses to boot with this provider when `NODE_ENV=production`,
 * exactly as it does for the mock provider, so it cannot reach real users.
 */
@Injectable()
export class PinOtpProvider implements OtpProvider {
  readonly name = 'pin';
  private readonly logger = new Logger(PinOtpProvider.name);

  send(phoneE164: string, _code: string, purpose: string): Promise<OtpSendResult> {
    // The PIN is never logged. It is shared out of band and does not change, so writing it
    // into a log file would leave the trial's only credential sitting on disk.
    this.logger.log(`${purpose} for ${phoneE164} accepted against the shared trial PIN`);
    return Promise.resolve({ messageId: `pin-${randomUUID()}` });
  }
}
