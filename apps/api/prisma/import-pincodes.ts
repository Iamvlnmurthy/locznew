/**
 * Imports every Indian postal code from the GeoNames dataset.
 *
 *   curl -o IN.zip https://download.geonames.org/export/zip/IN.zip   # then unzip
 *   npm run db:import-pincodes -w @locz/api -- path/to/IN.txt
 *
 * GeoNames lists one row per post office — roughly 155,000 rows across ~19,300 codes.
 * A user typing "500081" wants one place, not forty, so rows are collapsed to one record
 * per code with the centroid of its offices.
 *
 * That centroid is accurate enough to anchor a radius search: an urban pincode spans a
 * kilometre or two, and the alternative — demanding GPS permission — is something a large
 * share of users decline.
 *
 * Idempotent: re-running updates in place rather than duplicating.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface Accumulator {
  code: string;
  names: Map<string, number>;
  districts: Map<string, number>;
  states: Map<string, number>;
  latSum: number;
  lngSum: number;
  count: number;
}

/** The value seen most often — GeoNames spellings vary across a code's offices. */
function mostCommon(counts: Map<string, number>): string {
  let best = '';
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function bump(counts: Map<string, number>, value: string): void {
  if (!value) return;
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

async function main(): Promise<void> {
  const inputPath = resolve(process.argv[2] ?? 'C:/Users/USER/locz-stack/data/geonames/IN.txt');

  if (!existsSync(inputPath)) {
    console.error(`Dataset not found: ${inputPath}`);
    console.error('Download it from https://download.geonames.org/export/zip/IN.zip');
    process.exitCode = 1;
    return;
  }

  console.log(`Reading ${inputPath}`);

  const byCode = new Map<string, Accumulator>();
  let rows = 0;
  let skipped = 0;

  const reader = createInterface({
    input: createReadStream(inputPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    if (!line.trim()) continue;

    // country, postalCode, placeName, admin1(state), code1, admin2(district), code2,
    // admin3, code3, latitude, longitude, accuracy
    const parts = line.split('\t');
    const code = parts[1]?.trim() ?? '';
    const place = parts[2]?.trim() ?? '';
    const state = parts[3]?.trim() ?? '';
    const district = parts[5]?.trim() ?? '';
    const latitude = Number(parts[9]);
    const longitude = Number(parts[10]);

    rows += 1;

    // A pincode is exactly six digits, and a row without usable coordinates cannot
    // anchor a search — better to skip it than to store a point in the ocean.
    if (!/^\d{6}$/.test(code) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      skipped += 1;
      continue;
    }

    let entry = byCode.get(code);
    if (!entry) {
      entry = {
        code,
        names: new Map(),
        districts: new Map(),
        states: new Map(),
        latSum: 0,
        lngSum: 0,
        count: 0,
      };
      byCode.set(code, entry);
    }

    bump(entry.names, place);
    bump(entry.districts, district);
    bump(entry.states, state);
    entry.latSum += latitude;
    entry.lngSum += longitude;
    entry.count += 1;
  }

  console.log(
    `  ${rows.toLocaleString('en-IN')} rows read, ${skipped.toLocaleString('en-IN')} skipped`,
  );
  console.log(`  ${byCode.size.toLocaleString('en-IN')} distinct pincodes`);

  // Cities LocZ has launched in, so a pincode inside one links to it and inherits the
  // richer city-level browsing rather than only radius search.
  const cities = await prisma.city.findMany({
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  /** Nearest launched city within 25 km, else null. */
  function cityFor(latitude: number, longitude: number): string | null {
    let nearestId: string | null = null;
    let nearestKm = Number.POSITIVE_INFINITY;

    for (const city of cities) {
      // Equirectangular approximation — exact enough for a 25 km threshold and far
      // cheaper than haversine across 19,000 × 8 comparisons.
      const dLat = (Number(city.latitude) - latitude) * 111;
      const dLng =
        (Number(city.longitude) - longitude) * 111 * Math.cos((latitude * Math.PI) / 180);
      const km = Math.sqrt(dLat * dLat + dLng * dLng);

      if (km < nearestKm) {
        nearestKm = km;
        nearestId = city.id;
      }
    }

    return nearestKm <= 25 ? nearestId : null;
  }

  const records = [...byCode.values()].map((entry) => {
    const latitude = entry.latSum / entry.count;
    const longitude = entry.lngSum / entry.count;

    return {
      code: entry.code,
      name: mostCommon(entry.names).slice(0, 140) || entry.code,
      districtName: mostCommon(entry.districts).slice(0, 120) || 'Unknown',
      stateName: mostCommon(entry.states).slice(0, 120) || 'Unknown',
      latitude,
      longitude,
      officeCount: entry.count,
      cityId: cityFor(latitude, longitude),
    };
  });

  console.log('Writing…');

  // Batched: 19,000 individual upserts would take minutes. createMany with skipDuplicates
  // handles the common case (a fresh import) in seconds; the update pass fixes the rest.
  const BATCH = 1000;
  let written = 0;

  for (let index = 0; index < records.length; index += BATCH) {
    const batch = records.slice(index, index + BATCH);

    await prisma.$transaction(
      batch.map((record) =>
        prisma.pincode.upsert({
          where: { code: record.code },
          update: {
            name: record.name,
            districtName: record.districtName,
            stateName: record.stateName,
            latitude: record.latitude,
            longitude: record.longitude,
            officeCount: record.officeCount,
            cityId: record.cityId,
          },
          create: record,
        }),
      ),
    );

    written += batch.length;
    if (written % 5000 === 0 || written === records.length) {
      console.log(
        `  ${written.toLocaleString('en-IN')} / ${records.length.toLocaleString('en-IN')}`,
      );
    }
  }

  const linked = await prisma.pincode.count({ where: { cityId: { not: null } } });
  const states = await prisma.pincode.groupBy({ by: ['stateName'] });

  console.log(`\nImported ${written.toLocaleString('en-IN')} pincodes`);
  console.log(`  ${states.length} states and union territories`);
  console.log(`  ${linked.toLocaleString('en-IN')} linked to a launched city`);
}

main()
  .catch((error) => {
    console.error('Import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
