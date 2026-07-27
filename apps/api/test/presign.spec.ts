import { presignGetUrl, PresignOptions } from '../src/media/presign';

/**
 * The hand-rolled SigV4 query signer.
 *
 * Hand-rolled because `publicUrl` is called from four synchronous places — including the
 * search indexer — and the AWS SDK's presigner is asynchronous. The signing itself is
 * deterministic HMAC arithmetic, so it can be done inline; these tests are what make that
 * defensible rather than reckless.
 *
 * The behaviour worth protecting is the *window alignment*. A URL that changes on every
 * request cannot be cached, so the same photograph would be re-downloaded on every page view
 * — on the phones and connections least able to afford it.
 */
describe('presignGetUrl', () => {
  const base: PresignOptions = {
    endpoint: 'https://api.locz.in',
    region: 'us-east-1',
    bucket: 'locz-media',
    accessKeyId: 'testkey',
    secretAccessKey: 'testsecret',
    key: 'public/listings/abc/photo.webp',
    expiresIn: 900,
    windowSeconds: 3600,
  };

  function at(iso: string, overrides: Partial<PresignOptions> = {}): string {
    return presignGetUrl({ ...base, ...overrides, now: new Date(iso) });
  }

  it('produces an identical URL throughout a window, so it can be cached', () => {
    // The whole reason for aligning the signing time. Without this every request would
    // return a different URL and every image would be fetched again.
    const early = at('2026-07-27T10:00:00Z');
    const middle = at('2026-07-27T10:31:07Z');
    const late = at('2026-07-27T10:59:59Z');

    expect(middle).toBe(early);
    expect(late).toBe(early);
  });

  it('produces a different URL in the next window, so links do expire', () => {
    expect(at('2026-07-27T11:00:00Z')).not.toBe(at('2026-07-27T10:00:00Z'));
  });

  it('covers the whole window plus the requested lifetime', () => {
    // A URL minted at the very end of a window must still be usable for its full TTL, so
    // the expiry has to span the window as well. Otherwise a link handed out at 10:59
    // would die a second later.
    const expires = new URL(at('2026-07-27T10:00:00Z')).searchParams.get('X-Amz-Expires');
    expect(Number(expires)).toBe(3600 + 900);
  });

  it('signs the key, so one URL cannot be edited into another', () => {
    const photo = at('2026-07-27T10:00:00Z');
    const other = at('2026-07-27T10:00:00Z', { key: 'public/listings/abc/other.webp' });

    const signature = (url: string) => new URL(url).searchParams.get('X-Amz-Signature');
    expect(signature(photo)).not.toBe(signature(other));
  });

  it('uses path-style addressing, which MinIO requires', () => {
    expect(at('2026-07-27T10:00:00Z')).toContain('/locz-media/public/listings/abc/photo.webp');
  });

  it('never puts the secret in the URL', () => {
    const url = at('2026-07-27T10:00:00Z');

    expect(url).not.toContain('testsecret');
    expect(url).toContain('testkey');
  });

  it('escapes characters that would otherwise break the path', () => {
    // Object keys come from listing and media ids today, but a key with a space or a plus
    // must sign and encode consistently or the signature will not match what the server
    // recomputes.
    const url = at('2026-07-27T10:00:00Z', { key: 'public/a b/c+d.webp' });

    expect(url).toContain('/public/a%20b/c%2Bd.webp');
  });
});
