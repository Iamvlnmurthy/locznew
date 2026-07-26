/**
 * Generates a realistically-sized dataset, so performance can be measured rather than
 * guessed at.
 *
 *   npm run db:generate-load -w @locz/api -- 50000
 *   npm run db:generate-load -w @locz/api -- --clean
 *
 * With fifty listings PostgreSQL ignores every index on the table — a sequential scan is
 * genuinely cheaper — so a fast response proves nothing about the design. The only way to
 * know whether the spatial index, the composite browse index and the partial sweeper
 * indexes actually earn their keep is to put enough rows in front of them.
 *
 * The distribution matters as much as the count. Listings cluster the way real ones do:
 * heavily in launched cities, thinly across the rest of the country, with a long tail of
 * pincodes holding one or two. A uniform scatter would make every radius search return a
 * similar number of rows and hide exactly the case that hurts — the dense city centre.
 *
 * Everything it writes is tagged, so `--clean` removes precisely what it added and
 * nothing else.
 */
import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.resolve(__dirname, '..', '..', '..', '.env'), quiet: true });

import { PrismaPg } from '@prisma/adapter-pg';
import {
  ContactPreference,
  ItemCondition,
  ListingStatus,
  ListingType,
  MediaStatus,
  ModerationStatus,
  PrismaClient,
  Visibility,
} from '@prisma/client';
import { v7 as uuid } from 'uuid';

/**
 * The eight pictures the seed already ships, reused across the generated listings.
 *
 * Without these the site looks broken at volume: fifty thousand listings with no
 * photograph, and the handful of real ones lost among them. A marketplace where nothing
 * has a picture does not read as "test data", it reads as "not working".
 *
 * They are attached the way the seed attaches its own — a URL to a static file, no upload
 * and no storage round-trip. That is honest for demo rows and deliberately *not* how a real
 * upload works: a real one goes through quarantine, scanning and approval, which is the
 * whole point of that pipeline and must not be bypassed by anything a user can reach.
 */
const DEMO_IMAGES = [
  'iphone-13-blue.webp',
  'red-scooter.webp',
  'wood-study-desk.webp',
  'business-laptop.webp',
  'gachibowli-flat.webp',
  'madhapur-cafe.webp',
  'biryani-offer.webp',
  'electrician-service.webp',
];

const WEB_ORIGIN = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Every generated row carries this, so cleanup is exact rather than approximate. */
const TAG = 'loadgen';

const TITLES = [
  'Samsung double door fridge',
  'Honda Activa scooter',
  'Study table with chair',
  'iPhone in good condition',
  'Two bedroom flat for rent',
  'Delivery executive wanted',
  'AC servicing and gas refill',
  'Wedding photography package',
  'Second hand washing machine',
  'Wooden dining set for six',
  'Laptop for students',
  'Sofa cum bed, barely used',
];

const DESCRIPTIONS = [
  'Bought last year and hardly used. Selling because we are moving cities this month.',
  'In working condition, no complaints. Serious buyers only please, price is negotiable.',
  'Well maintained and cleaned regularly. Can be inspected any evening after six.',
  'Genuine reason for sale. Original bill and box available with all accessories.',
];

/** Weighted so the head of the distribution is dense enough to hurt if the index is wrong. */
function weightedIndex(count: number): number {
  // Squaring a uniform draw biases hard toward the low indices: the first few pincodes
  // (the launched cities) take the bulk of the rows, exactly as real supply does.
  return Math.floor(count * Math.random() ** 2);
}

/**
 * Indexed access is checked in this workspace, and rightly — but a random index into a
 * list already proven non-empty is one of the few places the assertion is honest.
 */
function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

async function clean(): Promise<void> {
  console.log('Removing generated rows…');

  const listings = await prisma.listing.findMany({
    where: { duplicateHash: TAG },
    select: { id: true },
  });
  const ids = listings.map((row) => row.id);

  if (ids.length > 0) {
    // Details and attributes cascade from the listing; media never existed for these.
    for (let index = 0; index < ids.length; index += 1000) {
      const batch = ids.slice(index, index + 1000);
      await prisma.listing.deleteMany({ where: { id: { in: batch } } });
      process.stdout.write(`\r  ${Math.min(index + 1000, ids.length)} / ${ids.length}`);
    }
    console.log('');
  }

  const users = await prisma.user.deleteMany({ where: { bio: TAG } });
  console.log(`Removed ${ids.length.toLocaleString('en-IN')} listings and ${users.count} users`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--clean')) {
    await clean();
    return;
  }

  const target = Number(process.argv[2] ?? 50_000);
  if (!Number.isFinite(target) || target < 1) {
    console.error('Usage: db:generate-load [count] | --clean');
    process.exitCode = 1;
    return;
  }

  // Launched cities first, then everywhere else — the weighting above turns this ordering
  // into the density curve.
  const pincodes = await prisma.pincode.findMany({
    where: { isServiceable: true },
    select: { code: true, latitude: true, longitude: true, cityId: true },
    orderBy: [{ cityId: { sort: 'asc', nulls: 'last' } }, { code: 'asc' }],
    take: 4000,
  });
  if (pincodes.length === 0) throw new Error('No pincodes — run db:import-pincodes first');

  const cities = await prisma.city.findMany({
    where: { isLaunched: true },
    select: { id: true, districtId: true, stateId: true, latitude: true, longitude: true },
  });
  if (cities.length === 0) throw new Error('No launched cities — run db:seed first');

  const categories = await prisma.category.findMany({
    where: { parentId: { not: null }, isActive: true },
    select: { id: true, parentId: true, listingTypes: true },
  });
  if (categories.length === 0) throw new Error('No categories — run db:seed first');

  console.log(`Generating ${target.toLocaleString('en-IN')} listings…`);

  // A pool of sellers rather than one, so per-owner queries and counts stay realistic.
  const sellerCount = Math.max(20, Math.floor(target / 40));
  const sellerIds: string[] = [];
  console.log(`  ${sellerCount.toLocaleString('en-IN')} sellers`);

  for (let index = 0; index < sellerCount; index += 500) {
    const batch = Array.from({ length: Math.min(500, sellerCount - index) }, (_, offset) => ({
      id: uuid(),
      // Reserved test range, and far from the numbers the acceptance suites generate.
      phoneE164: `+9170${String(10_000_000 + index + offset).slice(0, 8)}`,
      displayName: `Load Seller ${index + offset}`,
      bio: TAG,
      phoneVerifiedAt: new Date(),
    }));

    await prisma.user.createMany({ data: batch, skipDuplicates: true });
    sellerIds.push(...batch.map((row) => row.id));
  }

  const now = Date.now();
  let written = 0;

  for (let index = 0; index < target; index += 1000) {
    const size = Math.min(1000, target - index);
    const rows = Array.from({ length: size }, () => {
      // Weighted rather than uniform: the first pincodes are the launched cities, and
      // squaring the draw puts most of the supply there, as real supply is.
      const pincode = pincodes[weightedIndex(pincodes.length)] as (typeof pincodes)[number];
      const city = pick(cities);
      const category = pick(categories);
      const type = category.listingTypes.includes(ListingType.PRODUCT)
        ? ListingType.PRODUCT
        : (category.listingTypes[0] as ListingType);

      // Scatter within roughly a kilometre of the pincode centroid, so points are distinct
      // and the spatial index has real work to do rather than thousands of identical ones.
      const jitter = () => (Math.random() - 0.5) * 0.02;
      const publishedAt = new Date(now - Math.floor(Math.random() * 30) * 86_400_000);

      return {
        id: uuid(),
        type,
        ownerId: pick(sellerIds),
        title: `${pick(TITLES)} ${Math.floor(Math.random() * 9999)}`,
        slug: `loadgen-${uuid()}`,
        description: pick(DESCRIPTIONS),
        categoryId: category.parentId!,
        subcategoryId: category.id,
        status: ListingStatus.PUBLISHED,
        moderationStatus: ModerationStatus.APPROVED,
        cityId: city.id,
        districtId: city.districtId,
        stateId: city.stateId,
        pincodeCode: pincode.code,
        postalCode: pincode.code,
        latitude: Number(pincode.latitude) + jitter(),
        longitude: Number(pincode.longitude) + jitter(),
        contactPreference: ContactPreference.IN_APP_ONLY,
        visibility: Visibility.PUBLIC,
        publishedAt,
        expiresAt: new Date(publishedAt.getTime() + 30 * 86_400_000),
        viewCount: Math.floor(Math.random() ** 3 * 500),
        isFeatured: Math.random() < 0.02,
        duplicateHash: TAG,
      };
    });

    await prisma.listing.createMany({ data: rows, skipDuplicates: true });

    // Marketplace details for the types that carry a price, so price filters and sorts
    // have something to work against.
    const marketplace = rows
      .filter((row) => row.type === ListingType.PRODUCT)
      .map((row) => ({
        listingId: row.id,
        price: Math.floor(500 + Math.random() ** 2 * 80_000),
        isNegotiable: Math.random() < 0.6,
        condition: pick([
          ItemCondition.NEW,
          ItemCondition.LIKE_NEW,
          ItemCondition.GOOD,
          ItemCondition.FAIR,
        ]),
        quantity: 1,
      }));

    if (marketplace.length > 0) {
      await prisma.marketplaceDetail.createMany({ data: marketplace, skipDuplicates: true });
    }

    // A picture each, cycling through the eight. Not every listing in a real marketplace
    // has one, so roughly one in eight is left without — which is also what exercises the
    // "no photograph" placeholder that would otherwise never be seen.
    const media = rows
      .filter((_row, offset) => (index + offset) % 8 !== 7)
      .map((row, offset) => {
        const url = `${WEB_ORIGIN}/seed/listings/${DEMO_IMAGES[(index + offset) % DEMO_IMAGES.length]}`;
        return {
          id: uuid(),
          listingId: row.id,
          status: MediaStatus.READY,
          storageKey: url,
          thumbKey: url,
          cardKey: url,
          fullKey: url,
          mimeType: 'image/webp',
          width: 1200,
          height: 900,
          sortOrder: 0,
          isPrimary: true,
        };
      });

    if (media.length > 0) {
      await prisma.listingMedia.createMany({ data: media, skipDuplicates: true });
    }

    written += size;
    if (written % 5000 === 0 || written === target) {
      console.log(`  ${written.toLocaleString('en-IN')} / ${target.toLocaleString('en-IN')}`);
    }
  }

  // The geo column is filled by trigger on insert; ANALYZE is what makes the planner
  // aware that the table has changed shape, and without it the measurements would be
  // taken against stale statistics.
  console.log('Analysing…');
  await prisma.$executeRawUnsafe('ANALYZE listings');
  await prisma.$executeRawUnsafe('ANALYZE marketplace_details');

  const total = await prisma.listing.count();
  const withGeo = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM listings WHERE "geo" IS NOT NULL
  `;
  const geoCount = Number(withGeo[0]?.count ?? 0);

  console.log(`\n${total.toLocaleString('en-IN')} listings in total`);
  console.log(`${geoCount.toLocaleString('en-IN')} carry a geo point`);
}

main()
  .catch((error) => {
    console.error('Generation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
