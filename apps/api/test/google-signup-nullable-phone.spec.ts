import { ContactPreference, ListingStatus, ListingType, UserStatus } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';
import { ListingsService } from '../src/listings/listings.service';

/**
 * What a missing mobile number does to the rest of the platform.
 *
 * Google sign-up creates an account from a verified Google address, which carries no phone
 * number, so `User.phoneE164` is nullable. The risk is not in the sign-up path — it is in
 * the several places that read the column and were written when it could not be null. Each
 * case below is one of those reads.
 */
describe('an account with no mobile number', () => {
  const context = { ip: '203.0.113.9', userAgent: 'test', correlationId: 'c1' };
  const device = { deviceKey: 'k1', platform: 'WEB', name: 'Web browser' };

  // ------------------------------------------------------------------ the session
  describe('the session it signs in with', () => {
    function build(user: { id: string; phoneE164: string | null }) {
      const prisma = {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            ...user,
            email: 'ravi@example.com',
            displayName: 'Ravi',
            preferredLanguage: 'EN',
            status: UserStatus.ACTIVE,
            deletedAt: null,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        device: { upsert: jest.fn().mockResolvedValue({ id: 'd1', platform: 'WEB' }) },
      };
      const google = {
        resolveUser: jest.fn().mockResolvedValue({ id: user.id, isNewUser: !user.phoneE164 }),
        isConfigured: true,
      };

      const service = new AuthService(
        prisma as never,
        { verify: jest.fn(), issue: jest.fn() } as never,
        {
          issuePair: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
        } as never,
        {
          resolveAccess: jest.fn().mockResolvedValue({ roles: [], permissions: [] }),
        } as never,
        { record: jest.fn() } as never,
        { get: jest.fn() } as never,
        google as never,
        { verifyPhoneToken: jest.fn() } as never,
      );

      return { service, google };
    }

    it('tells the client to ask for a number', async () => {
      const { service } = build({ id: 'u-google', phoneE164: null });

      const session = await service.loginWithGoogle({ idToken: 'token', device } as never, context);

      // The field the web client branches on to send this person to /account/phone. It is
      // a statement of what to do, not an absent value the caller has to interpret.
      expect(session.user.requiresPhone).toBe(true);
      expect(session.user.phone).toBeNull();
    });

    it('reports a brand-new Google account as new', async () => {
      const { service } = build({ id: 'u-google', phoneE164: null });

      const session = await service.loginWithGoogle({ idToken: 'token', device } as never, context);

      // Google used to be able only to link, never to create, so this was hard-coded false.
      expect(session.user.isNewUser).toBe(true);
    });

    it('asks nothing of an account that already has a number', async () => {
      const { service } = build({ id: 'u-phone', phoneE164: '+919876543210' });

      const session = await service.loginWithGoogle({ idToken: 'token', device } as never, context);

      expect(session.user.requiresPhone).toBe(false);
      expect(session.user.phone).toBe('+919876543210');
    });
  });

  // ------------------------------------------------------------------ seller contact
  describe('the seller contact on a listing', () => {
    function listing(overrides: Record<string, unknown> = {}) {
      return {
        id: 'l1',
        slug: 'iron-cot-for-sale',
        type: ListingType.CLASSIFIED,
        title: 'Iron cot',
        description: 'A cot',
        status: ListingStatus.PUBLISHED,
        ownerId: 'u-google',
        isFeatured: false,
        viewCount: 3,
        publishedAt: new Date('2026-08-01T00:00:00Z'),
        addressLine: null,
        pincodeCode: '500001',
        latitude: null,
        longitude: null,
        contactPhone: null,
        showPhonePublicly: true,
        contactPreference: ContactPreference.PHONE_AND_IN_APP,
        city: { name: 'Hyderabad' },
        locality: null,
        marketplace: null,
        media: [],
        category: { id: 'c1', name: 'Furniture' },
        owner: {
          id: 'u-google',
          displayName: 'Ravi',
          createdAt: new Date('2026-07-01T00:00:00Z'),
          phoneE164: null,
        },
        attributeValues: [],
        buyerRequirement: null,
        ...overrides,
      };
    }

    function build(row: Record<string, unknown>) {
      const prisma = {
        listing: { findFirst: jest.fn().mockResolvedValue(row) },
        savedListing: { findMany: jest.fn().mockResolvedValue([]) },
        listingView: { create: jest.fn().mockResolvedValue({}) },
        recentlyViewed: { upsert: jest.fn().mockResolvedValue({}) },
      };
      const service = new ListingsService(
        prisma as never,
        {} as never, // geo
        {} as never, // categories
        {} as never, // moderation
        { listForListing: jest.fn().mockResolvedValue([]), toDto: jest.fn() } as never,
        {} as never, // rbac
        { record: jest.fn() } as never,
        {} as never, // searchIndex
        {} as never, // details
        {} as never, // redis
        {} as never, // saved-search queue
        {} as never, // requirement-match queue
      );
      // Recording a view is not what these cases are about, and it reaches for tables they
      // do not model.
      jest
        .spyOn(service as unknown as { recordView: () => unknown }, 'recordView')
        .mockResolvedValue(undefined as never);
      return service;
    }

    afterEach(() => jest.restoreAllMocks());

    it('offers no number when the seller has none, even having opted in to showing one', async () => {
      const service = build(listing());

      const detail = await service.getBySlug('iron-cot-for-sale');

      // `null` here already means "no number to show", and both clients guard on it — the
      // app hides the call button entirely and the web page passes `?? null` through. What
      // must never happen is a call affordance with nothing behind it.
      expect(detail.owner.phone).toBeNull();
    });

    it('still shows the number the seller put on the listing itself', async () => {
      const service = build(listing({ contactPhone: '+919812345678' }));

      const detail = await service.getBySlug('iron-cot-for-sale');

      // A per-listing contact number is independent of the account's own, so an account
      // without one can still publish a listing people can ring.
      expect(detail.owner.phone).toBe('+919812345678');
    });

    it('withholds it when the seller did not opt in, however it was supplied', async () => {
      const service = build(listing({ contactPhone: '+919812345678', showPhonePublicly: false }));

      const detail = await service.getBySlug('iron-cot-for-sale');

      expect(detail.owner.phone).toBeNull();
    });
  });
});
