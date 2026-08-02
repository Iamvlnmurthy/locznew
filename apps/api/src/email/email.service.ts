import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMAIL_PROVIDER, EmailMessage, EmailProvider } from './email-provider.interface';

/**
 * One entry point for every email the platform sends.
 *
 * Sending never throws to the caller. Email is a notification channel, not a transaction:
 * a password reset that could not be emailed should leave the request succeeding and the
 * token valid, because the alternative is a 500 that tells the user their account is broken
 * when it is the mail provider that is down. Failures are logged with enough to diagnose
 * them and nothing that identifies the recipient beyond a masked address.
 *
 * Bodies are never logged, at any level. A reset link in a log file is a credential in a log
 * file, and log files are copied, shipped and retained far beyond where anyone intends.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider) {}

  /**
   * Returns whether the message was accepted by the provider, so a caller that genuinely
   * needs to know — a support tool resending a link, say — can tell. Ordinary callers can
   * ignore it.
   */
  async send(message: EmailMessage): Promise<boolean> {
    try {
      const result = await this.provider.send(message);
      if (result.skipped) return false;

      this.logger.log(
        `Sent "${message.subject}" to ${this.mask(message.to)} via ${this.provider.name}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Could not send "${message.subject}" to ${this.mask(message.to)}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /** Enough to recognise the address in a support conversation, not enough to harvest it. */
  private mask(address: string): string {
    const [user, domain] = address.split('@');
    if (!domain || !user) return '***';
    return `${user.slice(0, 2)}***@${domain}`;
  }
}
