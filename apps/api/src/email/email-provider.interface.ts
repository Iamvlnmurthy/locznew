export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text is required; HTML is optional and always accompanies it. */
  text: string;
  html?: string;
  /** Grouping for provider-side reporting, e.g. "password-reset". */
  tag?: string;
}

export interface EmailSendResult {
  /** Provider-side id, kept for support and delivery troubleshooting. */
  messageId: string;
  /** True when nothing was actually sent because no provider is configured. */
  skipped?: boolean;
}

/**
 * Swap point for email delivery, mirroring the OTP provider abstraction.
 *
 * Adding a provider means implementing this and registering it in `EmailModule`; no call
 * site changes. The interface deliberately requires plain text and treats HTML as optional
 * — a mail that only renders as HTML is unreadable in the clients that strip it, and every
 * message this platform sends is short enough to say in words.
 */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
