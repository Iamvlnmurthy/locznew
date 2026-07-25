import {
  ContactPreference,
  ItemCondition,
  Listing,
  ListingStatus,
  ListingType,
  ModerationStatus,
  Prisma,
  User,
  UserStatus,
  Visibility,
} from '@prisma/client';
import { v7 as uuid } from 'uuid';

/**
 * Test factories.
 *
 * Every factory returns a complete, valid object and accepts overrides, so a test states
 * only what it actually cares about. A test that reads `makeListing({ title: 'FREE!!!' })`
 * makes its intent obvious; one that spells out twenty-five fields hides it.
 */

let sequence = 0;
const nextId = (): number => (sequence += 1);

/** Deterministic within a run — no randomness to make a failure unreproducible. */
export function resetFactorySequence(): void {
  sequence = 0;
}

export function makeUser(overrides: Partial<User> = {}): User {
  const index = nextId();

  return {
    id: uuid(),
    phoneE164: `+9198765${String(43210 + index).slice(0, 5)}`,
    phoneVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    email: `user${index}@locz.test`,
    emailVerifiedAt: null,
    passwordHash: null,
    displayName: `Test User ${index}`,
    avatarMediaId: null,
    bio: null,
    preferredLanguage: 'EN',
    status: UserStatus.ACTIVE,
    lastActiveAt: new Date('2026-01-01T00:00:00Z'),
    deletionRequestedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

export function makeListing(overrides: Partial<Listing> = {}): Listing {
  const index = nextId();

  return {
    id: uuid(),
    type: ListingType.PRODUCT,
    ownerId: uuid(),
    businessId: null,
    title: `Samsung 43 inch smart TV ${index}`,
    slug: `samsung-43-inch-smart-tv-${index}`,
    description:
      'Bought two years ago, moving cities so selling. Includes the original remote and box. Working perfectly.',
    categoryId: uuid(),
    subcategoryId: null,
    status: ListingStatus.PUBLISHED,
    moderationStatus: ModerationStatus.APPROVED,
    moderationScore: 0,
    rejectionReason: null,
    cityId: uuid(),
    districtId: null,
    stateId: null,
    localityId: null,
    postalCode: null,
    addressLine: null,
    latitude: new Prisma.Decimal('17.4483'),
    longitude: new Prisma.Decimal('78.3915'),
    serviceRadiusKm: null,
    isRemote: false,
    contactPreference: ContactPreference.IN_APP_ONLY,
    contactPhone: null,
    showPhonePublicly: false,
    visibility: Visibility.PUBLIC,
    publishedAt: new Date('2026-01-02T00:00:00Z'),
    expiresAt: new Date('2026-02-01T00:00:00Z'),
    soldAt: null,
    viewCount: 0,
    saveCount: 0,
    reportCount: 0,
    enquiryCount: 0,
    isFeatured: false,
    featuredUntil: null,
    isSponsored: false,
    isVerified: false,
    duplicateHash: null,
    searchIndexedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

/** A listing that should sail through moderation — the control case. */
export const cleanListingInput = {
  type: ListingType.PRODUCT,
  title: 'Samsung 43 inch smart TV in good condition',
  description:
    'Bought two years ago, moving cities so selling. Includes the original remote and box.',
  categoryId: uuid(),
  cityId: uuid(),
  marketplace: {
    price: 18000,
    condition: ItemCondition.GOOD,
    isNegotiable: true,
  },
};

/** The archetypal scam post, used to prove the rules engine actually blocks it. */
export const spamListingInput = {
  type: ListingType.PRODUCT,
  title: 'INSTANT LOAN APPROVED!!!',
  description:
    'Pay advance payment first. Call 9876543210 or 9876543211 now. Details bit.ly/quick-loan',
  categoryId: uuid(),
  cityId: uuid(),
  marketplace: { price: 1, condition: ItemCondition.NEW },
};

/**
 * A Prisma double. Only the methods a test actually exercises need stubbing; anything
 * else throws loudly rather than silently returning undefined and failing three
 * assertions later for the wrong reason.
 */
export function makePrismaMock(overrides: Record<string, unknown> = {}) {
  const model = () => ({
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    delete: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: {} }),
  });

  return {
    user: model(),
    listing: model(),
    listingMedia: model(),
    marketplaceDetail: model(),
    category: model(),
    categoryAttribute: model(),
    city: model(),
    locality: model(),
    savedLocation: model(),
    savedListing: model(),
    recentlyViewed: model(),
    conversation: model(),
    message: model(),
    block: model(),
    report: model(),
    moderationAction: model(),
    bannedKeyword: model(),
    notification: model(),
    notificationPreference: model(),
    business: model(),
    businessStaff: model(),
    businessHour: model(),
    device: model(),
    session: model(),
    otpAttempt: model(),
    authLockout: model(),
    role: model(),
    userRole: model(),
    auditLog: model(),
    systemSetting: model(),
    expiryRule: model(),
    $transaction: jest.fn((operations: unknown) =>
      Array.isArray(operations) ? Promise.all(operations) : (operations as () => unknown)(),
    ),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRawUnsafe: jest.fn(),
    ...overrides,
  };
}

export function makeRedisMock() {
  const store = new Map<string, string>();

  return {
    client: {
      llen: jest.fn().mockResolvedValue(0),
      zcard: jest.fn().mockResolvedValue(0),
    },
    incrementWithWindow: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(60),
    getJson: jest.fn(async (key: string) => {
      const raw = store.get(key);
      return raw ? JSON.parse(raw) : null;
    }),
    setJson: jest.fn(async (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
    }),
    setIfAbsent: jest.fn(async (key: string, value: string) => {
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    }),
    del: jest.fn(async (...keys: string[]) => {
      keys.forEach((key) => store.delete(key));
    }),
    ping: jest.fn().mockResolvedValue(true),
  };
}
