import sharp from 'sharp';
import {
  SAME_IMAGE_DISTANCE,
  fingerprintImage,
  hammingDistance,
} from '../src/media/image-fingerprint';

/**
 * Image fingerprinting.
 *
 * The claim being tested is narrow and worth stating plainly: this tells us whether two
 * files are the same picture. It tells us nothing about what the picture shows. The value
 * is that a moderator's refusal holds — block a photograph once and the re-crop, the
 * re-save and the screenshot are refused too, which is what someone tries next.
 */
describe('image fingerprinting', () => {
  /** A deterministic, non-uniform image — a flat colour hashes to nothing useful. */
  async function photograph(seed = 0): Promise<Buffer> {
    const width = 160;
    const height = 120;
    const pixels = Buffer.alloc(width * height * 3);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 3;
        pixels[index] = (x * 2 + seed * 40) % 256;
        pixels[index + 1] = (y * 3 + seed * 15) % 256;
        pixels[index + 2] = ((x + y) * 2) % 256;
      }
    }

    return sharp(pixels, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 92 })
      .toBuffer();
  }

  it('gives the same file the same fingerprint', async () => {
    const image = await photograph();

    const first = await fingerprintImage(image);
    const second = await fingerprintImage(image);

    expect(first.sha256).toBe(second.sha256);
    expect(first.perceptual).toBe(second.perceptual);
    expect(first.perceptual).toHaveLength(16);
  });

  it('gives different pictures different fingerprints', async () => {
    const first = await fingerprintImage(await photograph(0));
    const second = await fingerprintImage(await photograph(3));

    expect(first.sha256).not.toBe(second.sha256);
    expect(hammingDistance(first.perceptual, second.perceptual)).toBeGreaterThan(
      SAME_IMAGE_DISTANCE,
    );
  });

  describe('survives what someone does to get a removed picture back up', () => {
    it('re-compression', async () => {
      const original = await photograph();
      const recompressed = await sharp(original).jpeg({ quality: 40 }).toBuffer();

      const before = await fingerprintImage(original);
      const after = await fingerprintImage(recompressed);

      // The bytes change completely, which is exactly why the exact hash is not enough.
      expect(after.sha256).not.toBe(before.sha256);
      expect(hammingDistance(before.perceptual, after.perceptual)).toBeLessThanOrEqual(
        SAME_IMAGE_DISTANCE,
      );
    });

    it('resizing', async () => {
      const original = await photograph();
      const resized = await sharp(original).resize({ width: 80 }).jpeg().toBuffer();

      const before = await fingerprintImage(original);
      const after = await fingerprintImage(resized);

      expect(hammingDistance(before.perceptual, after.perceptual)).toBeLessThanOrEqual(
        SAME_IMAGE_DISTANCE,
      );
    });

    it('a change of format', async () => {
      const original = await photograph();
      const converted = await sharp(original).webp({ quality: 80 }).toBuffer();

      const before = await fingerprintImage(original);
      const after = await fingerprintImage(converted);

      expect(hammingDistance(before.perceptual, after.perceptual)).toBeLessThanOrEqual(
        SAME_IMAGE_DISTANCE,
      );
    });
  });

  describe('hamming distance', () => {
    it('is zero for identical hashes', () => {
      expect(hammingDistance('abcd1234abcd1234', 'abcd1234abcd1234')).toBe(0);
    });

    it('counts single bits, not characters', () => {
      // 0x1 differs from 0x0 in one bit; 0xf differs from 0x0 in four.
      expect(hammingDistance('1000000000000000', '0000000000000000')).toBe(1);
      expect(hammingDistance('f000000000000000', '0000000000000000')).toBe(4);
    });

    it('refuses to compare hashes of different lengths rather than guessing', () => {
      expect(hammingDistance('abcd', 'abcdef')).toBe(Number.POSITIVE_INFINITY);
    });
  });

  it('hashes an image it cannot fully decode rather than failing the upload', async () => {
    // A fingerprint should never be the reason a legitimate upload is refused — the format
    // check has already run by this point.
    const truncated = (await photograph()).subarray(0, 900);

    await expect(fingerprintImage(truncated)).resolves.toMatchObject({
      sha256: expect.any(String),
      perceptual: expect.any(String),
    });
  });
});
