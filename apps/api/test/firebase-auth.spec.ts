import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { FirebaseAuthService } from '../src/auth/firebase-auth.service';

/**
 * Confirming a mobile number through Firebase.
 *
 * The device verifies the number and hands back a signed assertion. The whole security of the
 * feature is in refusing to trust that assertion because it looks official: the signature
 * proves Google issued it, the audience proves it was minted for this project rather than one
 * of millions of others, and the issuer proves it is a Firebase ID token rather than some
 * other Google-signed JWT. Each case below removes one of those and expects a rejection.
 *
 * A real key pair is generated here rather than mocking the crypto. Mocking verification in a
 * test for a verifier would assert nothing at all.
 */
describe('FirebaseAuthService', () => {
  const PROJECT = 'locz-app';

  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  // The cert endpoint serves X.509 PEMs keyed by kid; node's verify accepts a public key in
  // the same call, so the fetch is stubbed to return this key directly.
  const certs = { 'kid-1': publicKey.export({ type: 'spki', format: 'pem' }) as string };

  function sign(payload: Record<string, unknown>, kid = 'kid-1', alg = 'RS256'): string {
    const encode = (value: unknown): string =>
      Buffer.from(JSON.stringify(value)).toString('base64url');

    const head = encode({ alg, kid, typ: 'JWT' });
    const body = encode(payload);

    const signer = createSign('RSA-SHA256');
    signer.update(`${head}.${body}`);
    return `${head}.${body}.${signer.sign(privateKey).toString('base64url')}`;
  }

  const now = Math.floor(Date.now() / 1000);
  const validPayload = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'firebase-uid-1',
    iat: now - 10,
    exp: now + 3600,
    phone_number: '+919876543210',
  };

  function build(projectId: string | undefined = PROJECT) {
    const service = new FirebaseAuthService({ get: () => projectId } as never);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => certs,
      headers: { get: () => 'max-age=3600' },
    }) as never;

    return service;
  }

  it('accepts a token Google signed for this project', async () => {
    const service = build();

    await expect(service.verifyPhoneToken(sign(validPayload))).resolves.toEqual({
      phoneE164: '+919876543210',
      firebaseUid: 'firebase-uid-1',
    });
  });

  it('refuses a token minted for another Firebase project', async () => {
    const service = build();

    // Without the audience check, a token from any of millions of Firebase apps could be
    // replayed here and accepted as proof of a number.
    await expect(
      service.verifyPhoneToken(sign({ ...validPayload, aud: 'someone-elses-app' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('refuses a Google-signed token that is not a Firebase ID token', async () => {
    const service = build();

    await expect(
      service.verifyPhoneToken(sign({ ...validPayload, iss: 'https://accounts.google.com' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('refuses a token signed by a key it does not know', async () => {
    const service = build();
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });

    const encode = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString('base64url');
    const head = encode({ alg: 'RS256', kid: 'kid-1', typ: 'JWT' });
    const body = encode(validPayload);
    const signer = createSign('RSA-SHA256');
    signer.update(`${head}.${body}`);
    const forged = `${head}.${body}.${signer.sign(other.privateKey).toString('base64url')}`;

    await expect(service.verifyPhoneToken(forged)).rejects.toThrow(UnauthorizedException);
  });

  it('refuses an unsigned token', async () => {
    const service = build();

    // Pinning the algorithm is what stops "alg: none" and algorithm confusion. The header is
    // written by whoever sent the token, so it cannot be allowed to choose.
    await expect(service.verifyPhoneToken(sign(validPayload, 'kid-1', 'none'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses an expired token', async () => {
    const service = build();

    await expect(service.verifyPhoneToken(sign({ ...validPayload, exp: now - 1 }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses a valid token that verified no phone number', async () => {
    const service = build();
    const { phone_number: _omitted, ...withoutPhone } = validPayload;

    // A Firebase token from an email or Google sign-in is genuine, correctly signed, and says
    // nothing whatsoever about a phone number.
    await expect(service.verifyPhoneToken(sign(withoutPhone))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses a number that is not an Indian mobile', async () => {
    const service = build();

    await expect(
      service.verifyPhoneToken(sign({ ...validPayload, phone_number: '+14155550100' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('refuses malformed input without throwing something unexpected', async () => {
    const service = build();

    await expect(service.verifyPhoneToken('not-a-token')).rejects.toThrow(UnauthorizedException);
  });

  it('reports unavailable rather than invalid when unconfigured', async () => {
    const service = build('');

    // The caller's token may be perfectly valid. Telling them it was invalid would send them
    // chasing the wrong problem entirely.
    await expect(service.verifyPhoneToken(sign(validPayload))).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('caches certificates instead of fetching on every verification', async () => {
    const service = build();

    await service.verifyPhoneToken(sign(validPayload));
    await service.verifyPhoneToken(sign(validPayload));

    // A network round trip in the middle of sign-up, on every attempt, for keys that rotate
    // over days.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('serves stale certificates rather than rejecting everybody', async () => {
    const service = build();
    await service.verifyPhoneToken(sign(validPayload));

    (service as unknown as { certsExpireAt: number }).certsExpireAt = 0;
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as never;

    // The certificates rotate slowly, so an old set is far more likely to be right than
    // refusing every verification on the platform is.
    await expect(service.verifyPhoneToken(sign(validPayload))).resolves.toBeDefined();
  });
});
