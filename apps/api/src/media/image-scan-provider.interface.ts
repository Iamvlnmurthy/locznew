export const IMAGE_SCAN_PROVIDER = Symbol('IMAGE_SCAN_PROVIDER');

export interface ImageScanSubject {
  mediaId: string;
  mimeType: string;
  bytes: Buffer;
  sha256: string;
}

export interface ImageScanVerdict {
  decision: 'APPROVE' | 'REVIEW' | 'REJECT';
  reasons: string[];
  provider: string;
}

/**
 * Vendor boundary for content classification and protected hash matching.
 *
 * Implementations must map vendor-specific labels into this deliberately small contract.
 * The pipeline never imports a vendor SDK and therefore cannot accidentally interpret an
 * undocumented confidence score as permission to publish.
 */
export interface ImageScanProvider {
  scan(subject: ImageScanSubject): Promise<ImageScanVerdict>;
}
