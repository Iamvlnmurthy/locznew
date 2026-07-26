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
  /**
   * Whether the perceptual hash means anything for this image.
   *
   * A blank or near-blank picture has no structure to describe, so every one of them
   * reduces to the same sixty-four zero bits. Matching on that would mean a moderator
   * blocking one placeholder image silently refuses every plain background anyone ever
   * uploads — and the seller is told their photograph was previously removed, which is
   * both wrong and impossible to argue with. When this is false, only the exact hash
   * should be used.
   */
  distinctive: boolean;
}

export async function fingerprintImage(image: Buffer): Promise<ImageFingerprint> {
  const sha256 = createHash('sha256').update(image).digest('hex');

  // `failOn: 'none'` because a fingerprint should never be the reason an upload fails —
  // the format check has already run, and a picture we cannot hash is still a picture we
  // can serve.
  // `greyscale()` desaturates but keeps three channels, so the raw buffer is 9 x 8 x 3.
  // Indexing it as if it were one byte per pixel reads the red and green of the first few
  // pixels instead of luminance across the image — which made a detailed photograph hash
  // to all zeros, the same as a flat colour. `toColourspace('b-w')` is what actually
  // reduces it to one channel; `resolveWithObject` then lets the stride be asserted rather
  // than assumed.
  const { data: pixels, info } = await sharp(image, { failOn: 'none' })
    .greyscale()
    .toColourspace('b-w')
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const stride = info.channels;

  let bits = '';
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const left = pixels[(row * 9 + column) * stride] ?? 0;
      const right = pixels[(row * 9 + column + 1) * stride] ?? 0;
      bits += left > right ? '1' : '0';
    }
  }

  // 64 bits as 16 hex characters.
  let perceptual = '';
  for (let index = 0; index < 64; index += 4) {
    perceptual += parseInt(bits.slice(index, index + 4), 2).toString(16);
  }

  // Distinctiveness is a property of the hash, not of the picture.
  //
  // Measuring the image's contrast was wrong: these bits record whether each cell is
  // brighter than the one to its right, so an image with strong *vertical* structure and
  // none horizontally — a white field above a black band — has plenty of contrast and
  // still hashes to sixty-four zeros. It then collides with every other such image, which
  // is precisely how an unrelated photograph came to be refused in testing.
  //
  // Counting the set bits asks the question directly: a hash that is almost all zeros or
  // almost all ones has recorded nothing to tell two pictures apart by.
  const setBits = bits.split('').filter((bit) => bit === '1').length;
  const distinctive = setBits >= MINIMUM_SET_BITS && setBits <= 64 - MINIMUM_SET_BITS;

  return { sha256, perceptual, distinctive };
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

/**
 * How lopsided a hash may be before it has stopped describing anything.
 *
 * Twelve of sixty-four in each direction. A real photograph lands near the middle; a blank
 * image, a plain gradient or a picture with no horizontal variation collapses to one end,
 * and comparing those to each other refuses honest uploads. Deliberately generous — the
 * cost of treating a real photograph as indistinct is that a re-crop of it gets through,
 * while the cost of the reverse is refusing a seller who did nothing wrong.
 */
export const MINIMUM_SET_BITS = 12;
