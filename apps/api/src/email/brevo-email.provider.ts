import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import { EmailMessage, EmailProvider, EmailSendResult } from './email-provider.interface';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/** Long enough for a slow API, short enough that a hung request cannot hold a worker. */
const TIMEOUT_MS = 15_000;

/**
 * Transactional email through Brevo.
 *
 * Transactional only, deliberately. This platform sends password resets, a grievance-contact
 * acknowledgement and claim confirmations — messages somebody asked for. Marketing to
 * addresses collected from open datasets is a different thing with different obligations
 * under the DPDP Act and under Brevo's own anti-abuse policy, and sending it through the
 * same account risks the account that carries the password resets.
 *
 * The API key never appears in a log, an error message or a thrown exception. Brevo echoes
 * request context in some failures, so only the status and the provider's message are
 * surfaced.
 */
@Injectable()
export class BrevoEmailProvider implements EmailProvider {
  readonly name = 'brevo';
  private readonly logger = new Logger(BrevoEmailProvider.name);

  constructor(private readonly config: AppConfig) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': this.config.get('BREVO_API_KEY'),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: this.config.get('BREVO_SENDER_EMAIL'),
          name: this.config.get('BREVO_SENDER_NAME'),
        },
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? { htmlContent: message.html } : {}),
        ...(message.tag ? { tags: [message.tag] } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // Read the body for the provider's own message, but surface only that and the status.
      // Brevo echoes parts of the request in some errors, and the request carried the key.
      const detail = await response
        .json()
        .then((body: unknown) => (body as { message?: string })?.message ?? '')
        .catch(() => '');

      throw new Error(`Brevo rejected the send: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`);
    }

    const body = (await response.json()) as { messageId?: string };
    return { messageId: body.messageId ?? 'unknown' };
  }
}
