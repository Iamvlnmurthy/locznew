import { createHash, createHmac } from 'node:crypto';

/**
 * A SigV4 query-signed GET URL, computed synchronously.
 *
 * The AWS SDK's `getSignedUrl` is asynchronous only because it resolves credentials; the
 * signing itself is deterministic HMAC arithmetic. That distinction matters here because
 * `StorageService.publicUrl` is called from four synchronous places, including the search
 * indexer and the listing mapper, and making it async would ripple through code that has
 * nothing to do with storage.
 *
 * **The expiry is deliberately aligned to a window rather than "now + TTL".** A URL that
 * changes on every request is uncacheable: the same photograph would be re-downloaded on
 * every page view, on phones and connections where that is exactly the wrong trade. Rounding
 * the start of the validity period down to a fixed boundary means every request within that
 * window produces a byte-identical URL, so browsers cache normally, while the link a scraper
 * copied still stops working within a bounded time.
 *
 * The consequence is that a link's remaining life varies between one and two windows. That is
 * the intended trade: cacheability is worth more than a precise expiry for content that is,
 * by design, shown to anyone browsing the site.
 */
export interface PresignOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  key: string;
  /** How long a link stays valid, in seconds. */
  expiresIn: number;
  /** Aligns the signing time, so URLs are stable and cacheable. Defaults to one hour. */
  windowSeconds?: number;
  /** Injectable for tests; production uses the wall clock. */
  now?: Date;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/** Encodes a path segment the way SigV4 requires — `/` kept, everything else escaped. */
function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}

export function presignGetUrl(options: PresignOptions): string {
  const windowSeconds = options.windowSeconds ?? 3600;
  const now = options.now ?? new Date();

  // Align to the window so the same key yields the same URL for its duration.
  const aligned = new Date(
    Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000,
  );
  const amzDate = aligned.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const endpoint = new URL(options.endpoint);
  const host = endpoint.host;
  // Path-style addressing: MinIO requires it and R2 accepts it.
  const canonicalUri = encodePath(
    `${endpoint.pathname.replace(/\/$/, '')}/${options.bucket}/${options.key}`,
  );

  const scope = `${dateStamp}/${options.region}/s3/aws4_request`;
  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${options.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    // Validity is measured from the aligned time, so it covers the whole window plus the TTL.
    'X-Amz-Expires': String(windowSeconds + options.expiresIn),
    'X-Amz-SignedHeaders': 'host',
  });
  // SigV4 requires the query string sorted by key.
  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${options.secretAccessKey}`, dateStamp), options.region), 's3'),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  return `${endpoint.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
