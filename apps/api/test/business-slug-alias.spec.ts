import { NotFoundException } from '@nestjs/common';
import { BusinessesService } from '../src/businesses/businesses.service';

/**
 * What happens to a URL after the business it points at is renamed.
 *
 * Three and a half million imported records were slugged `name-000j-hrcf`, where the last two
 * segments are an import batch number and a disambiguator — noise in the part of the URL that
 * should be carrying the locality and the city. Re-slugging them is worth doing, and it is
 * only safe because every previous slug keeps resolving. These cases are that guarantee.
 */
describe('a business whose URL has changed', () => {
  const row = {
    id: 'b1',
    slug: 'friendly-icecream-muzaffarpur',
    name: 'Friendly icecream',
    ownerId: null,
    categoryId: 'c1',
    cityId: 'ct1',
    keywords: [],
    socialLinks: [],
    pincodeCode: '842001',
    latitude: null,
    longitude: null,
    primaryPhone: null,
    whatsappNumber: null,
    email: null,
    website: null,
    description: null,
    hours: [],
    media: [],
    category: { id: 'c1', name: 'Bakeries & sweets' },
    city: { name: 'Muzaffarpur' },
    address: null,
    staff: [],
    _count: { listings: 0 },
    verificationStatus: 'UNVERIFIED',
    claimStatus: 'UNCLAIMED',
    businessType: 'RETAIL_STORE',
    scale: null,
    offering: null,
    isPremium: false,
    isActive: true,
    viewCount: 0,
    saveCount: 0,
    createdAt: new Date('2026-08-03T00:00:00Z'),
    updatedAt: new Date('2026-08-03T00:00:00Z'),
    sourceName: null,
    licenceName: null,
    attributionText: null,
    logoMediaId: null,
    coverMediaId: null,
    addressId: null,
  };

  function build(found: Record<string, unknown> | null, alias: { businessId: string } | null) {
    const business = {
      // findFirst is asked twice: once for the slug as given, once by id after an alias hit.
      findFirst: jest.fn().mockResolvedValueOnce(found).mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({}),
    };
    const prisma = {
      business,
      businessSlugAlias: { findUnique: jest.fn().mockResolvedValue(alias) },
      savedBusiness: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BusinessesService(
      prisma as never,
      {} as never, // rbac
      { record: jest.fn() } as never, // audit
      {} as never, // storage
      {} as never, // notifications
      {} as never, // businessSearch
      { localize: (keywords: string[]) => keywords } as never, // keyword translations
      { enrich: jest.fn().mockResolvedValue(null) } as never, // bank branches
      { enrich: jest.fn().mockResolvedValue(null) } as never, // post offices
    );
    return { service, prisma };
  }

  it('serves the business when an old URL is requested', async () => {
    const { service, prisma } = build(null, { businessId: 'b1' });

    const detail = await service.getBySlug('friendly-icecream-000j-hrcf');

    expect(prisma.businessSlugAlias.findUnique).toHaveBeenCalledWith({
      where: { slug: 'friendly-icecream-000j-hrcf' },
      select: { businessId: true },
    });
    // It answers with the current slug, not the one asked for. That difference is the signal
    // the web layer uses to send a 308 rather than serving one business at two URLs.
    expect(detail.slug).toBe('friendly-icecream-muzaffarpur');
  });

  it('does not look for an alias when the slug is current', async () => {
    const { service, prisma } = build(row, null);

    await service.getBySlug('friendly-icecream-muzaffarpur');

    expect(prisma.businessSlugAlias.findUnique).not.toHaveBeenCalled();
  });

  it('is still a 404 when the slug was never used by anybody', async () => {
    const { service } = build(null, null);

    await expect(service.getBySlug('never-existed')).rejects.toBeInstanceOf(NotFoundException);
  });
});
