import { createHash } from 'node:crypto';
import sharp from 'sharp';

/**
 * Two fingerprints for one image.
 *
 * SHA-256 answers "is this the same file?". It is exact, cheap and useless the moment
 * anyone re-saves the picture — which is the first thing someone does after a listing is
 * removed.
 *
 * The difference hash answers "is this the same picture?". The image is reduced to a 9×8
 * grey thumbnail and each pixel compared with its right-hand neighbour, giving 64 bits
 * that describe the shape of the light in it rather than its bytes. Re-cropping,
 * re-compressing, resizing and small watermarks leave most of those bits intact, so two
 * versions of one photograph land within a few bits of each other.
 *
 * It is not a content classifier and cannot be one. It has no idea what the picture shows.
 * What it does is make a moderator's decision stick: block the hash once, and the same
 * photograph stops coming back.
 */
export interface ImageFingerprint {
  sha256: string;
  perceptual: string;
}

export async function fingerprintImage(image: Buffer): Promise<ImageFingerprint> {
  const sha256 = createHash('sha256').update(image).digest('hex');

  // `failOn: 'none'` because a fingerprint should never be the reason an upload fails —
  // the format check has already run, and a picture we cannot hash is still a picture we
  // can serve.
  const pixels = await sharp(image, { failOn: 'none' })
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();

  let bits = '';
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const left = pixels[row * 9 + column] ?? 0;
      const right = pixels[row * 9 + column + 1] ?? 0;
      bits += left > right ? '1' : '0';
    }
  }

  // 64 bits as 16 hex characters.
  let perceptual = '';
  for (let index = 0; index < 64; index += 4) {
    perceptual += parseInt(bits.slice(index, index + 4), 2).toString(16);
  }

  return { sha256, perceptual };
}

/**
 * How many of the 64 bits differ.
 *
 * Zero is the same picture. Under about five is the same picture through another
 * compressor or crop. Above ten is two different photographs that happen to share a
 * composition — a lot of listing photos are "a phone on a table", so the threshold has to
 * leave room for that or every second handset gets flagged as a duplicate.
 */
export function hammingDistance(left: string, right: string): number {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;

  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const difference = parseInt(left[index]!, 16) ^ parseInt(right[index]!, 16);
    // Four bits per hex character.
    distance +=
      ((difference >> 3) & 1) +
      ((difference >> 2) & 1) +
      ((difference >> 1) & 1) +
      (difference & 1);
  }
  return distance;
}

/** Near enough to be the same photograph. Deliberately tight — see the note above. */
export const SAME_IMAGE_DISTANCE = 5;
