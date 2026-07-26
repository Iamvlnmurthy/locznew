/**
 * Every named place in India, and the mandal it sits in.
 *
 *   npm run db:import-villages -w @locz/api -- path/to/IN.txt
 *
 * The pincode import collapsed 155,570 post-office rows into 19,238 codes, which was the
 * right unit for "where shall I search". It is the wrong unit for "where am I". A pincode
 * covers dozens of villages, and somebody in Sirikonda does not think of themselves as
 * being in Nizamabad any more than a Londoner thinks of themselves as being in the South
 * East.
 *
 * This reads the same file for the layer that was thrown away: **155,542 named places** and
 * the **11,359 mandals** they belong to — mandal in the Telugu states, taluk in the south,
 * tehsil in the north, block in the east.
 *
 * Every village needs a district to hang from, which the pincode already knows, so the
 * chain is village → pincode → district → state and nothing has to be guessed.
 *
 * Idempotent, and safe to re-run when GeoNames publishes an update.
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { v7 as uuid } from 'uuid';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Values GeoNames uses to mean "we do not know", which must not reach an address line. */
const PLACEHOLDER_MANDALS = new Set(['NA', 'N.A.', 'NULL', 'UNKNOWN', '-', '']);

interface Village {
  name: string;
  slug: string;
  mandal: string | null;
  postalCode: string;
  latitude: number;
  longitude: number;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150);
}

async function main(): Promise<void> {
  const inputPath = path.resolve(
    process.argv[2] ?? 'C:/Users/USER/locz-stack/data/geonames/IN.txt',
  );

  if (!existsSync(inputPath)) {
    console.error(`Dataset not found: ${inputPath}`);
    console.error('Download it from https://download.geonames.org/export/zip/IN.zip');
    process.exitCode = 1;
    return;
  }

  // Which district each pincode belongs to. Every pincode has a city after
  // db:activate-india, so a village can always be placed.
  const pincodes = await prisma.pincode.findMany({
    where: { cityId: { not: null } },
    select: { code: true, cityId: true },
  });
  const cityForPincode = new Map(pincodes.map((row) => [row.code, row.cityId!]));

  if (cityForPincode.size === 0) {
    console.error('No pincode has a city yet — run db:activate-india first.');
    process.exitCode = 1;
    return;
  }
  console.log(`${cityForPincode.size.toLocaleString('en-IN')} pincodes can host a village`);

  // Grouped by city, because the uniqueness constraint is per city and a village name
  // repeats freely across the country — there are Ramapuram villages in four states.
  const byCity = new Map<string, Map<string, Village>>();
  const mandalForPincode = new Map<string, Map<string, number>>();
  let rows = 0;
  let skipped = 0;

  const reader = createInterface({
    input: createReadStream(inputPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    if (!line.trim()) continue;
    rows += 1;

    // country, postalCode, placeName, admin1, code1, admin2, code2, admin3, code3, lat, lng
    const parts = line.split('\t');
    const code = parts[1]?.trim() ?? '';
    const name = parts[2]?.trim() ?? '';
    // GeoNames writes "NA" where it has no sub-district — 8,035 places carry it. Stored
    // as-is it renders "Sawkuchi, NA, Kamrup" in an address line, which reads as a bug to
    // anyone who lives there. Absent is the honest value for absent.
    const rawMandal = parts[7]?.trim() ?? '';
    const mandal = PLACEHOLDER_MANDALS.has(rawMandal.toUpperCase()) ? null : rawMandal || null;
    const latitude = Number(parts[9]);
    const longitude = Number(parts[10]);

    const cityId = cityForPincode.get(code);
    if (!cityId || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      skipped += 1;
      continue;
    }

    const slug = slugify(name);
    if (!slug) {
      skipped += 1;
      continue;
    }

    if (mandal) {
      const counts = mandalForPincode.get(code) ?? new Map<string, number>();
      counts.set(mandal, (counts.get(mandal) ?? 0) + 1);
      mandalForPincode.set(code, counts);
    }

    const villages = byCity.get(cityId) ?? new Map<string, Village>();

    // The same village name can appear twice in one district under different pincodes —
    // two hamlets sharing a name in neighbouring mandals. The slug carries the pincode in
    // that case so both survive rather than one silently overwriting the other.
    let key = slug;
    const existing = villages.get(key);
    if (existing && existing.postalCode !== code) key = `${slug}-${code}`;
    if (villages.has(key)) continue;

    villages.set(key, { name, slug: key, mandal, postalCode: code, latitude, longitude });
    byCity.set(cityId, villages);
  }

  const total = [...byCity.values()].reduce((sum, villages) => sum + villages.size, 0);
  console.log(
    `  ${rows.toLocaleString('en-IN')} rows read, ${skipped.toLocaleString('en-IN')} skipped`,
  );
  console.log(`  ${total.toLocaleString('en-IN')} villages across ${byCity.size} districts`);

  // ------------------------------------------------------------------ write
  // `skipDuplicates` rather than upsert: 155,000 upserts take minutes, and a village's
  // name and position do not change between GeoNames releases. Re-running fills gaps.
  console.log('Writing…');
  let written = 0;

  for (const [cityId, villages] of byCity) {
    const rows = [...villages.values()].map((village) => ({
      id: uuid(),
      cityId,
      name: village.name.slice(0, 140),
      slug: village.slug,
      mandal: village.mandal?.slice(0, 140) ?? null,
      postalCode: village.postalCode,
      latitude: village.latitude,
      longitude: village.longitude,
    }));

    for (let index = 0; index < rows.length; index += 1000) {
      await prisma.locality.createMany({
        data: rows.slice(index, index + 1000),
        skipDuplicates: true,
      });
    }

    written += rows.length;
    if (written % 20000 < 1000) {
      console.log(`  ${written.toLocaleString('en-IN')} / ${total.toLocaleString('en-IN')}`);
    }
  }

  // The pincode's own mandal is the one most of its offices report.
  console.log('Naming the mandals…');
  let mandalsSet = 0;
  for (const [code, counts] of mandalForPincode) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!best) continue;
    await prisma.pincode.update({
      where: { code },
      data: { mandal: best.slice(0, 140) },
    });
    mandalsSet += 1;
  }

  await prisma.$executeRawUnsafe('ANALYZE localities');
  await prisma.$executeRawUnsafe('ANALYZE pincodes');

  const stored = await prisma.locality.count();
  const withGeo = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM localities WHERE "geo" IS NOT NULL
  `;
  const mandals = await prisma.locality.findMany({
    where: { mandal: { not: null } },
    distinct: ['mandal'],
    select: { mandal: true },
  });

  console.log(`\n${stored.toLocaleString('en-IN')} villages and areas stored`);
  console.log(`${Number(withGeo[0]?.count ?? 0).toLocaleString('en-IN')} carry a map position`);
  console.log(`${mandals.length.toLocaleString('en-IN')} mandals, taluks and tehsils named`);
  console.log(`${mandalsSet.toLocaleString('en-IN')} pincodes now name their mandal`);
}

main()
  .catch((error) => {
    console.error('Import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
