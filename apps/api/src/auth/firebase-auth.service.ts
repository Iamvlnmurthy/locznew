import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createVerify } from 'node:crypto';
import { AppConfig } from '../config/config.module';

/**
 * Where Google publishes the certificates Firebase signs ID tokens with.
 *
 * Different from the endpoint that serves Google sign-in's keys, which is why
 * google-auth-library cannot be pointed at this: Firebase tokens carry a different issuer and
 * are signed by a different service account.
 */
const FIREBASE_CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

/** Falls back to an hour when the response carries no usable Cache-Control. */
const DEFAULT_CERT_TTL_MS = 60 * 60 * 1000;

interface FirebaseTokenPayload {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  iat: number;
  auth_time?: number;
  phone_number?: string;
}

/**
 * Confirming a mobile number through Firebase.
 *
 * The shape is different from every other provider in this codebase, and the difference is
 * the whole point. With an SMS gateway the platform sends a code and checks it. With Firebase
 * the device does both, and hands back a signed assertion that a number was verified. Our job
 * is not to trust that assertion because it looks official — it is to verify it cryptographically
 * and check it was minted for us.
 *
 * Three checks matter and all three are load-bearing. The signature proves Google issued it.
 * The audience proves it was minted for this project rather than replayed from some other
 * Firebase app, of which there are millions. The issuer proves it is a Firebase ID token
 * rather than some other Google-signed JWT. Skipping any one of them turns "verified phone
 * number" into "phone number somebody sent us", which is what the field already was.
 *
 * What this unlocks: `phoneVerifiedAt`. Until a number is confirmed it cannot count towards
 * claiming a business, because matching an unconfirmed number against a public directory
 * proves only that the claimant can read.
 */
@Injectable()
export class FirebaseAuthService {
  private readonly logger = new Logger(FirebaseAuthService.name);

  /** kid → PEM certificate, refreshed when Google says it has expired. */
  private certs: Record<string, string> = {};
  private certsExpireAt = 0;

  constructor(private readonly config: AppConfig) {}

  /**
   * Verifies a Firebase ID token and returns the number it confirms.
   *
   * Throws rather than returning null on every failure. A caller that forgot to check a
   * boolean would silently mark a number verified, and there is no safe default for that.
   */
  async verifyPhoneToken(idToken: string): Promise<{ phoneE164: string; firebaseUid: string }> {
    const projectId = this.config.get('FIREBASE_PROJECT_ID');
    if (!projectId) {
      // Distinct from a rejection: the caller's token may be perfectly valid, and telling
      // them it was invalid would send them chasing the wrong problem.
      throw new ServiceUnavailableException('Phone verification is not configured.');
    }

    const payload = await this.verify(idToken, projectId);

    const phone = payload.phone_number;
    if (!phone) {
      // A Firebase token from an email or Google sign-in is genuine and correctly signed and
      // still says nothing about a phone number.
      throw new UnauthorizedException('That sign-in did not verify a phone number.');
    }

    if (!/^\+91[6-9]\d{9}$/.test(phone)) {
      throw new UnauthorizedException('Only Indian mobile numbers are supported.');
    }

    return { phoneE164: phone, firebaseUid: payload.sub };
  }

  private async verify(idToken: string, projectId: string): Promise<FirebaseTokenPayload> {
    const invalid = new UnauthorizedException('That verification could not be confirmed.');

    const parts = idToken.split('.');
    if (parts.length !== 3) throw invalid;

    const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string];

    let header: { kid?: string; alg?: string };
    let payload: FirebaseTokenPayload;
    try {
      header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString()) as typeof header;
      payload = JSON.parse(Buffer.from(rawPayload, 'base64url').toString()) as FirebaseTokenPayload;
    } catch {
      throw invalid;
    }

    // Pinned. Accepting whatever the token asks for is how "alg: none" and algorithm-confusion
    // attacks work, and the header is written by whoever sent the token.
    if (header.alg !== 'RS256' || !header.kid) throw invalid;

    const certs = await this.certificates();
    const cert = certs[header.kid];
    if (!cert) throw invalid;

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${rawHeader}.${rawPayload}`);
    if (!verifier.verify(cert, Buffer.from(rawSignature, 'base64url'))) throw invalid;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) throw new UnauthorizedException('That verification has expired.');
    if (payload.iat > now + 60) throw invalid;

    // Without this a token minted for any other Firebase project could be replayed here.
    if (payload.aud !== projectId) throw invalid;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw invalid;
    if (!payload.sub) throw invalid;

    return payload;
  }

  /**
   * Google's signing certificates, cached until they expire.
   *
   * Fetched rather than bundled because Google rotates them, and a pinned copy would fail
   * silently and completely the day it rotated. Cached because fetching on every verification
   * would put a network round trip in the middle of sign-up.
   */
  private async certificates(): Promise<Record<string, string>> {
    if (Date.now() < this.certsExpireAt && Object.keys(this.certs).length > 0) {
      return this.certs;
    }

    const response = await fetch(FIREBASE_CERT_URL);
    if (!response.ok) {
      // Serve stale rather than reject everybody. The certificates rotate slowly, so an old
      // set is far more likely to be right than refusing every verification is.
      if (Object.keys(this.certs).length > 0) {
        this.logger.warn(`Could not refresh Firebase certificates (HTTP ${response.status})`);
        return this.certs;
      }
      throw new ServiceUnavailableException('Phone verification is temporarily unavailable.');
    }

    this.certs = (await response.json()) as Record<string, string>;

    const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1];
    this.certsExpireAt = Date.now() + (maxAge ? Number(maxAge) * 1000 : DEFAULT_CERT_TTL_MS);

    return this.certs;
  }
}
