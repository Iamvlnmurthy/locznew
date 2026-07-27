/**
 * Opens LocZ everywhere in India.
 *
 *   npm run db:activate-india -w @locz/api
 *   npm run db:activate-india -w @locz/api -- --dry-run
 *
 * Before this, the country was four launched cities. A seller in Warangal or Kochi had a
 * pincode, could browse by radius — and could not post at all, because `Listing.cityId` is
 * required and no city existed to attach a listing to. 442 of 19,238 pincodes had a city;
 * the other 18,796 were places you could look at and not use.
 *
 * The fix is data, not schema. Every pincode already carries its district and state, so
 * this builds the geography those names imply: 35 states, 638 districts, and one place per
 * district that a listing can belong to. Coordinates come from the centroid of that
 * district's own pincodes, which is more honest than any gazetteer we do not have.
 *
 * Two decisions worth knowing about.
 *
 * *The postable unit is the district.* Not the town — that would mean tens of thousands of
 * rows, most of them hamlets nobody searches for. Not the state — too coarse to mean
 * anything locally. Every Indian address names a district, so the district is the level
 * everyone can answer for. The pincode still carries the precision: search is a radius
 * around a centroid, and the district only decides which page a listing belongs to.
 *
 * *The eight seeded cities are left exactly as they are.* Hyderabad, Warangal and the rest
 * were created with real coordinates, Telugu and Hindi names, and localities beneath them.
 * They are matched by name and kept; the district rows are created around them.
 *
 * Idempotent. Re-running adjusts what changed and creates nothing twice.
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });

import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl } from './connection';
import { PrismaClient } from '@prisma/client';
import { v7 as uuid } from 'uuid';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl() }),
});

const dryRun = process.argv.includes('--dry-run');

/** Lower case, no punctuation, single hyphens — matches the slugs the app already uses. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 130);
}

async function main(): Promise<void> {
  const country = await prisma.country.findFirst({ where: { iso2: 'IN' } });
  if (!country) throw new Error('India is not seeded — run db:seed first');

  // Everything is derived from the pincode table, which is the only complete picture of
  // the country this project has.
  const areas = await prisma.pincode.groupBy({
    by: ['stateName', 'districtName'],
    _count: { code: true },
    _avg: { latitude: true, longitude: true },
  });

  const states = new Set(areas.map((area) => area.stateName));
  console.log(
    `${areas.length.toLocaleString('en-IN')} districts across ${states.size} states and union territories`,
  );

  if (dryRun) {
    const existingCities = await prisma.city.count();
    const linked = await prisma.pincode.count({ where: { cityId: { not: null } } });
    console.log(`\nDry run. Today: ${existingCities} cities, ${linked} pincodes linked.`);
    console.log(`Would ensure ${states.size} states, ${areas.length} districts and places.`);
    return;
  }

  // ------------------------------------------------------------------ states
  const stateIds = new Map<string, string>();

  for (const name of [...states].sort()) {
    const slug = slugify(name);
    const existing = await prisma.state.findFirst({
      where: { countryId: country.id, slug },
    });

    if (existing) {
      stateIds.set(name, existing.id);
      continue;
    }

    const created = await prisma.state.create({
      data: { id: uuid(), countryId: country.id, name, slug },
    });
    stateIds.set(name, created.id);
  }
  console.log(`  states: ${stateIds.size}`);

  // ------------------------------------------------------------------ districts and places
  let districtsCreated = 0;
  let citiesCreated = 0;
  let citiesAdopted = 0;

  for (const area of areas) {
    const stateId = stateIds.get(area.stateName)!;
    const districtSlug = slugify(area.districtName);
    if (!districtSlug) continue;

    let district = await prisma.district.findFirst({ where: { stateId, slug: districtSlug } });
    if (!district) {
      district = await prisma.district.create({
        data: { id: uuid(), stateId, name: area.districtName, slug: districtSlug },
      });
      districtsCreated += 1;
    }

    // A city seeded by hand with real coordinates and translated names is better than
    // anything derived here, so an existing one is adopted rather than duplicated.
    const existingCity =
      (await prisma.city.findFirst({ where: { districtId: district.id } })) ??
      (await prisma.city.findFirst({ where: { stateId, name: area.districtName } }));

    if (existingCity) {
      await prisma.city.update({
        where: { id: existingCity.id },
        data: { districtId: district.id, isLaunched: true, isActive: true },
      });
      citiesAdopted += 1;
      continue;
    }

    const latitude = Number(area._avg.latitude ?? 0);
    const longitude = Number(area._avg.longitude ?? 0);
    if (!latitude || !longitude) continue;

    // The slug is globally unique because it doubles as a landing-page URL, and district
    // names repeat across states — there is a Bilaspur in three of them.
    let slug = districtSlug;
    if (await prisma.city.findUnique({ where: { slug } })) {
      slug = `${districtSlug}-${slugify(area.stateName)}`.slice(0, 130);
    }

    await prisma.city.create({
      data: {
        id: uuid(),
        stateId,
        districtId: district.id,
        name: area.districtName,
        slug,
        latitude,
        longitude,
        isLaunched: true,
        isActive: true,
      },
    });
    citiesCreated += 1;
  }

  console.log(`  districts: ${districtsCreated} created`);
  console.log(`  places: ${citiesCreated} created, ${citiesAdopted} existing kept`);

  // ------------------------------------------------------------------ link the pincodes
  // Done in SQL: nineteen thousand individual updates through the client would take
  // minutes to do what one statement does in a second.
  const linked = await prisma.$executeRawUnsafe(`
    UPDATE pincodes p
    SET "cityId" = c.id
    FROM cities c
    JOIN districts d ON d.id = c."districtId"
    JOIN states s ON s.id = d."stateId"
    WHERE p."cityId" IS NULL
      AND lower(d.name) = lower(p."districtName")
      AND lower(s.name) = lower(p."stateName")
  `);
  console.log(`  pincodes linked: ${linked.toLocaleString('en-IN')}`);

  // The geo column is filled by trigger on insert; cities created above already have one.
  await prisma.$executeRawUnsafe('ANALYZE cities');
  await prisma.$executeRawUnsafe('ANALYZE pincodes');

  const totals = {
    states: await prisma.state.count(),
    districts: await prisma.district.count(),
    cities: await prisma.city.count({ where: { isLaunched: true } }),
    unlinked: await prisma.pincode.count({ where: { cityId: null } }),
    withoutGeo: await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM cities WHERE "geo" IS NULL
    `,
  };

  console.log(
    `\n${totals.states} states · ${totals.districts} districts · ${totals.cities} places open`,
  );
  console.log(`${totals.unlinked.toLocaleString('en-IN')} pincodes still without a place`);
  console.log(`${Number(totals.withoutGeo[0]?.count ?? 0)} places without a geo point`);
}

main()
  .catch((error) => {
    console.error('Activation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
