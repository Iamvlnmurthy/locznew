import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, EmailProvider, EmailSendResult } from './email-provider.interface';

/**
 * What runs when no email provider is configured.
 *
 * Logs the subject and recipient and sends nothing. Two reasons this exists rather than the
 * service throwing: development and tests must be able to complete a password reset without
 * a mail account, and a missing key must not take down an API whose main job has nothing to
 * do with email.
 *
 * It never logs the body. A reset link in a log file is a credential in a log file, and log
 * files travel further than anyone intends.
 */
@Injectable()
export class LogEmailProvider implements EmailProvider {
  readonly name = 'log';
  private readonly logger = new Logger(LogEmailProvider.name);

  // Nothing to await — the whole point is that no message leaves the process. The signature
  // stays a promise because `EmailProvider` is asynchronous for the providers that do send.
  send(message: EmailMessage): Promise<EmailSendResult> {
    this.logger.warn(
      `No email provider configured — not sending "${message.subject}" to ${this.mask(message.to)}`,
    );
    return Promise.resolve({ messageId: 'not-sent', skipped: true });
  }

  /** Enough to recognise the address in a support conversation, not enough to harvest it. */
  private mask(address: string): string {
    const [user, domain] = address.split('@');
    if (!domain || !user) return '***';
    return `${user.slice(0, 2)}***@${domain}`;
  }
}
