import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { PUBLIC_BRANDS } = require('../packages/public-brands');
const root = path.resolve(import.meta.dirname, '..');
const publicRoot = path.join(root, 'apps/web/public');
const missing = PUBLIC_BRANDS.filter(
  (brand) => !fs.existsSync(path.join(publicRoot, brand.logoAsset)),
);

if (missing.length) {
  console.error(`Missing brand assets: ${missing.map((brand) => brand.key).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`${PUBLIC_BRANDS.length} public-brand assets present.`);
}

if (process.argv.includes('--contact-sheet') && !missing.length) {
  const cellWidth = 220;
  const cellHeight = 150;
  const columns = 5;
  const sheet = await Promise.all(
    PUBLIC_BRANDS.map(async (brand, index) => {
      const logo = await sharp(path.join(publicRoot, brand.logoAsset), { density: 300 })
        .resize(118, 86, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toBuffer();
      const safeLabel = brand.displayName.replaceAll('&', '&amp;');
      const label = Buffer.from(
        `<svg width="196" height="32"><text x="98" y="19" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="#173f35">${safeLabel}</text></svg>`,
      );
      const card = await sharp({
        create: { width: 204, height: 134, channels: 4, background: '#ffffff' },
      })
        .composite([
          { input: logo, left: 43, top: 10 },
          { input: label, left: 4, top: 98 },
        ])
        .png()
        .toBuffer();
      return {
        input: card,
        left: (index % columns) * cellWidth + 8,
        top: Math.floor(index / columns) * cellHeight + 8,
      };
    }),
  );
  const output = path.join(publicRoot, 'brands/businesses/_contact-sheet.jpg');
  await sharp({
    create: {
      width: columns * cellWidth,
      height: Math.ceil(PUBLIC_BRANDS.length / columns) * cellHeight,
      channels: 3,
      background: '#eef4f0',
    },
  })
    .composite(sheet)
    .jpeg({ quality: 90 })
    .toFile(output);
  console.log(output);
}
