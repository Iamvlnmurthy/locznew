import { type ImageScanSubject } from './image-scan-provider.interface';

export const PROTECTED_HASH_PROVIDER = Symbol('PROTECTED_HASH_PROVIDER');

export interface ProtectedHashResult {
  status: 'NO_MATCH' | 'MATCH' | 'UNAVAILABLE';
  provider: string;
  reasonCode?: string;
  /**
   * An opaque case/result id supplied by the approved provider—not a content hash.
   * It may be used for the provider's reporting workflow but is never shown to users.
   */
  reference?: string;
}

export interface ProtectedHashProvider {
  match(subject: ImageScanSubject): Promise<ProtectedHashResult>;
}

const STATUSES = new Set<ProtectedHashResult['status']>(['NO_MATCH', 'MATCH', 'UNAVAILABLE']);
function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function boundedText(
  value: unknown,
  field: string,
  maximumLength: number,
  required: boolean,
): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`protected-hash response ${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength || hasControlCharacters(normalized)) {
    throw new Error(`protected-hash response ${field} is invalid`);
  }
  return normalized;
}

/**
 * Runtime boundary for vetted adapters.
 *
 * TypeScript cannot protect us from a remote API changing shape. Validate and reduce every
 * provider response before it can open a legal hold; malformed results throw so the retry
 * service converts them to UNAVAILABLE rather than guessing.
 */
export function validateProtectedHashResult(value: unknown): ProtectedHashResult {
  if (!value || typeof value !== 'object') {
    throw new Error('protected-hash response must be an object');
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.status !== 'string' ||
    !STATUSES.has(candidate.status as ProtectedHashResult['status'])
  ) {
    throw new Error('protected-hash response status is invalid');
  }
  const status = candidate.status as ProtectedHashResult['status'];
  const provider = boundedText(candidate.provider, 'provider', 60, true)!;
  const reasonCode = boundedText(
    candidate.reasonCode,
    'reasonCode',
    80,
    status === 'MATCH' || status === 'UNAVAILABLE',
  );
  const reference = boundedText(candidate.reference, 'reference', 200, status === 'MATCH');

  return {
    status,
    provider,
    ...(reasonCode ? { reasonCode } : {}),
    ...(reference ? { reference } : {}),
  };
}
