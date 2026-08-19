#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const batchSize = 25;
const gridSize = 5;
const cellSize = 256;

function categoryCatalog() {
  const migration = readFileSync(
    resolve(
      root,
      'apps/api/prisma/migrations/20260803100000_product_categories/migration.sql',
    ),
    'utf8',
  );
  const product = migration
    .split(/\r?\n/)
    .map((line) =>
      line.match(
        /^(?:VALUES \(gen_random_uuid\(\),NULL,|SELECT gen_random_uuid\(\),p\.id,)'([^']+)'[^\n]*?,'([^']+)',ARRAY/,
      ),
    )
    .filter(Boolean)
    .map((match) => ({ kind: 'category', name: match[1], slug: match[2] }));

  const directory = JSON.parse(
    readFileSync(resolve(root, 'apps/api/prisma/data/directory-categories.json'), 'utf8'),
  ).map((entry) => ({ kind: 'category', name: entry.name, slug: entry.slug }));

  const seed = readFileSync(resolve(root, 'apps/api/prisma/seed.ts'), 'utf8');
  const categorySource = seed.slice(
    seed.indexOf('const CATEGORIES:'),
    seed.indexOf('// Free posting attracts'),
  );
  const curated = Array.from(
    categorySource.matchAll(/\bname:\s*'([^']+)'[\s\S]{0,240}?\bslug:\s*'([^']+)'/g),
    (match) => ({ kind: 'category', name: match[1], slug: match[2] }),
  );

  return Array.from(
    new Map([...product, ...directory, ...curated].map((entry) => [entry.slug, entry])).values(),
  );
}

const discoveryNames = [
  'Local Now',
  'Happening Nearby',
  'Deals',
  'Food',
  'Jobs',
  'Rentals',
  'Marketplace',
  'Services',
  'Learning',
  'Health',
  'Mobility',
  'Play',
  'Entertainment',
  'Pets',
  'Community',
  'Civic',
  'Emergency',
  'Businesses',
  'New Nearby',
  'Earn Nearby',
  'Free Nearby',
  'Local Requests',
  'Property',
  'Vehicles',
  'Local Professionals',
  'Home',
];

const categories = categoryCatalog();
const discovery = discoveryNames.map((name) => ({
  kind: 'discovery',
  name,
  slug: name
    .toLowerCase()
    .replace(/ & /g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''),
}));
const catalog = [...categories, ...discovery];

if (categories.length !== 183 || discovery.length !== 26 || catalog.length !== 209) {
  throw new Error(
    `Catalog changed: expected 183 categories + 26 discovery areas, got ${categories.length} + ${discovery.length}`,
  );
}

const sheets = Array.from({ length: Math.ceil(catalog.length / batchSize) }, (_, index) => {
  const value = process.env[`LOCZ_ICON_SHEET_${index + 1}`];
  if (!value) throw new Error(`LOCZ_ICON_SHEET_${index + 1} is required`);
  return resolve(value);
});

const destinations = {
  category: [
    resolve(root, 'apps/web/public/icons/category-library'),
    resolve(root, 'apps/mobile/assets/category-library'),
  ],
  discovery: [
    resolve(root, 'apps/web/public/icons/discovery'),
    resolve(root, 'apps/mobile/assets/discovery'),
  ],
};
Object.values(destinations)
  .flat()
  .forEach((directory) => mkdirSync(directory, { recursive: true }));

const normalizedSheets = await Promise.all(
  sheets.map((sheet) =>
    sharp(sheet)
      .resize(gridSize * cellSize, gridSize * cellSize, { fit: 'fill' })
      .ensureAlpha()
      .png()
      .toBuffer(),
  ),
);

for (const [index, entry] of catalog.entries()) {
  const sheetIndex = Math.floor(index / batchSize);
  const cellIndex = index % batchSize;
  const column = cellIndex % gridSize;
  const row = Math.floor(cellIndex / gridSize);
  // The final partial sheet contains nine icons laid out as five columns by two rows
  // in the upper half of the canvas; its row height is therefore 320px after normalization.
  const cellHeight = sheetIndex === sheets.length - 1 ? (gridSize * cellSize) / 4 : cellSize;
  const extracted = await sharp(normalizedSheets[sheetIndex])
    .extract({ left: column * cellSize, top: row * cellHeight, width: cellSize, height: cellHeight })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Clear a narrow perimeter so anti-aliased pixels from an adjacent cell cannot bleed in.
  const border = sheetIndex === sheets.length - 1 ? 28 : 8;
  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellSize; x += 1) {
      if (x >= border && x < cellSize - border && y >= border && y < cellHeight - border) continue;
      extracted.data[(y * cellSize + x) * extracted.info.channels + 3] = 0;
    }
  }
  const cell = await sharp(extracted.data, {
    raw: {
      width: cellSize,
      height: cellHeight,
      channels: extracted.info.channels,
    },
  })
    .png()
    .toBuffer();
  const cropped = await sharp(cell)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .resize(224, 224, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: 16,
      right: 16,
      bottom: 16,
      left: 16,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 88, alphaQuality: 100, effort: 4 })
    .toBuffer();

  for (const destination of destinations[entry.kind]) {
    writeFileSync(resolve(destination, `${entry.slug}.webp`), cropped);
  }
}

const nameToSlug = Object.fromEntries(
  categories.map((entry) => [entry.name.trim().toLowerCase(), entry.slug]),
);
const webSource = `// Generated by scripts/build-premium-icon-library.mjs. Do not edit by hand.\n\nexport const premiumCategoryNameToSlug: Readonly<Record<string, string>> = ${JSON.stringify(nameToSlug, null, 2)};\n\nexport function premiumCategoryArtwork({ slug, name }: { slug?: string | null; name?: string | null }): string {\n  const resolved = slug || (name ? premiumCategoryNameToSlug[name.trim().toLowerCase()] : undefined);\n  return resolved ? \`/icons/category-library/\${resolved}.webp\` : '/icons/categories/business-premium.webp';\n}\n\nconst discoveryAliases: Readonly<Record<string, string>> = { shopping: 'marketplace', events: 'happening-nearby', news: 'local-now', alerts: 'emergency' };\n\nexport function premiumDiscoveryArtwork(area: string): string {\n  const slug = discoveryAliases[area] ?? area;\n  return \`/icons/discovery/\${slug}.webp\`;\n}\n`;
writeFileSync(resolve(root, 'apps/web/src/lib/premium-icon-catalog.ts'), webSource);

const dartEntries = Object.entries(nameToSlug)
  .map(([name, slug]) => `  ${JSON.stringify(name)}: ${JSON.stringify(slug)},`)
  .join('\n');
const dartSource = `// Generated by scripts/build-premium-icon-library.mjs. Do not edit by hand.\nconst _businessCategorySlugs = <String, String>{\n${dartEntries}\n};\n\nString businessCategoryAsset(String? categoryName) {\n  final normalized = categoryName?.trim().toLowerCase();\n  final slug = normalized == null ? null : _businessCategorySlugs[normalized];\n  return slug == null\n      ? 'assets/categories/business-premium.webp'\n      : 'assets/category-library/\$slug.webp';\n}\n\nString discoveryAreaAsset(String area) {\n  final slug = switch (area) {\n    'shopping' => 'marketplace',\n    'events' => 'happening-nearby',\n    _ => area,\n  };\n  return 'assets/discovery/\$slug.webp';\n}\n`;
writeFileSync(
  resolve(root, 'apps/mobile/lib/features/listings/presentation/business_category_art.dart'),
  dartSource,
);

writeFileSync(
  resolve(root, 'packages/ui-tokens/src/premium-icon-catalog.json'),
  `${JSON.stringify({ version: 1, categories, discovery }, null, 2)}\n`,
);

console.log(`Generated ${categories.length} category icons and ${discovery.length} discovery icons.`);
