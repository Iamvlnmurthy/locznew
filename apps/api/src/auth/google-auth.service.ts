import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { AppConfig } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sign in with Google.
 *
 * Verifies the ID token Google issued rather than trusting anything the client says about
 * who it is. The token is signed by Google, so its email and `email_verified` claim can be
 * relied on once the signature, the audience and the issuer all check out — and the library
 * checks all three.
 *
 * The security decision that matters here is when to attach a Google login to an existing
 * account. Matching on an email address Google has not verified is how account takeover
 * happens: anyone can put somebody else's address on a Google account, and if that silently
 * linked, they would inherit the other person's listings, chats and roles. So an unverified
 * address is refused outright rather than used to create or find anything.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly client: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {
    this.client = new OAuth2Client(this.config.get('GOOGLE_CLIENT_ID'));
  }

  get isConfigured(): boolean {
    return Boolean(this.config.get('GOOGLE_CLIENT_ID'));
  }

  /**
   * Turns a Google ID token into the LocZ user it belongs to.
   *
   * Returns the user for `AuthService` to issue a session for; this service deliberately
   * does not mint tokens itself, so every sign-in path produces a session the same way and
   * device registration, lockouts and refresh rotation cannot drift between them.
   */
  async resolveUser(idToken: string): Promise<{ id: string }> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Google sign-in is not available');
    }

    const payload = await this.verify(idToken);

    const email = payload.email?.trim().toLowerCase();
    if (!email) {
      throw new UnauthorizedException('That Google account has no email address');
    }

    // The whole basis for linking. Google says whether it has confirmed the address belongs
    // to this account; without that confirmation the address is a claim, not a fact.
    if (!payload.email_verified) {
      throw new UnauthorizedException(
        'Your Google email address is not verified. Verify it with Google and try again.',
      );
    }

    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (existing) {
      if (existing.status === UserStatus.SUSPENDED) {
        throw new UnauthorizedException('This account is suspended. Contact support.');
      }

      // Records that Google has confirmed this address, which password sign-up never
      // established. Nothing else about the account is overwritten: a display name the
      // person chose here should not be replaced by whatever their Google profile says.
      if (!existing.emailVerifiedAt) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { emailVerifiedAt: new Date() },
        });
      }

      return { id: existing.id };
    }

    // Google links to an existing account; it does not create one.
    //
    // `User.phoneE164` is NOT NULL and unique, and the number is how this platform reaches
    // people and how sellers are contacted — a mobile marketplace account without one is
    // half an account. Making the column nullable to accommodate Google would change the
    // shape of every account for the sake of one sign-in path, so somebody signing in with
    // Google for the first time is asked to register once, and Google works from then on.
    //
    // Deliberately worded so it cannot be used to discover which addresses have accounts:
    // the same message is returned whether or not one exists under a different email.
    throw new UnauthorizedException(
      'No LocZ account uses this Google address yet. Create an account with your mobile ' +
        'number first, then sign in with Google.',
    );
  }

  private async verify(idToken: string) {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        // Rejects a token minted for a different application. Without this, a token from any
        // Google app could be replayed here and accepted as a LocZ login.
        audience: this.config.get('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload) throw new Error('empty payload');
      return payload;
    } catch (error) {
      // The reason is logged, never returned. Telling a caller precisely why a token failed
      // helps somebody probing for a forgery that will pass.
      this.logger.warn(
        `Rejected a Google token: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Could not verify that Google sign-in');
    }
  }
}
