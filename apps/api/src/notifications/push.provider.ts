import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/config.module';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Firebase Cloud Messaging via the HTTP v1 API, using a service-account JWT.
 *
 * Credentials come from the environment. With none configured the provider logs and
 * reports success — local development must not need a Firebase project, and a missing
 * push token is not a reason to fail the action that triggered the notification.
 */
@Injectable()
export class PushProvider {
  private readonly logger = new Logger(PushProvider.name);
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: AppConfig) {}

  get isConfigured(): boolean {
    return Boolean(
      this.config.get('FCM_PROJECT_ID') &&
      this.config.get('FCM_CLIENT_EMAIL') &&
      this.config.get('FCM_PRIVATE_KEY'),
    );
  }

  async send(message: PushMessage): Promise<{ delivered: boolean; reason?: string }> {
    if (!this.isConfigured) {
      this.logger.debug(`[push disabled] ${message.title} → ${message.token.slice(0, 12)}…`);
      return { delivered: true, reason: 'fcm-not-configured' };
    }

    const projectId = this.config.get('FCM_PROJECT_ID');
    const token = await this.getAccessToken();

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: message.token,
            notification: { title: message.title, body: message.body },
            data: message.data ?? {},
            android: { priority: 'high' },
            apns: { headers: { 'apns-priority': '10' } },
          },
        }),
      },
    );

    if (response.ok) return { delivered: true };

    const detail = await response.text();

    // 404 / UNREGISTERED means the app was uninstalled. That is permanent, so the caller
    // should drop the token rather than retry it forever.
    if (response.status === 404 || detail.includes('UNREGISTERED')) {
      return { delivered: false, reason: 'token-unregistered' };
    }

    throw new Error(`FCM responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  /**
   * Exchanges the service-account key for an OAuth access token, cached until shortly
   * before expiry so a burst of notifications does not re-authenticate each time.
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return this.accessToken.value;
    }

    const { createSign } = await import('node:crypto');
    const clientEmail = this.config.get('FCM_CLIENT_EMAIL')!;
    // Private keys carry literal \n when passed through an environment variable.
    const privateKey = this.config.get('FCM_PRIVATE_KEY')!.replace(/\\n/g, '\n');

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode(header)}.${encode(claims)}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Could not obtain an FCM access token: HTTP ${response.status}`);
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = {
      value: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };

    return body.access_token;
  }
}
