import { HttpStatus } from '@nestjs/common';
import { AuditService } from '../src/audit/audit.service';
import { paginate } from '../src/common/dto/pagination.dto';
import { listingSlug, slugify } from '../src/common/utils/slug.util';
import { TooManyRequestsException } from '../src/common/exceptions/too-many-requests.exception';
import { PrismaService } from '../src/prisma/prisma.service';
import { makePrismaMock } from './factories';

describe('slug utility', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Samsung 43 inch Smart TV')).toBe('samsung-43-inch-smart-tv');
  });

  it('strips punctuation that would break a URL', () => {
    expect(slugify('iPhone 13 — 128GB!! (like new)')).toBe('iphone-13-128gb-like-new');
  });

  it('collapses repeated separators and trims the edges', () => {
    expect(slugify('  ---Hello???World---  ')).toBe('hello-world');
  });

  it('produces an empty slug for text with no ASCII — the caller must handle it', () => {
    // Telugu has no transliteration here, so a title written entirely in it reduces to
    // nothing. listingSlug is what makes that safe.
    expect(slugify('ఇల్లు అద్దెకు')).toBe('');
  });

  it('never produces a bare separator for a non-Latin title', () => {
    const slug = listingSlug('ఇల్లు అద్దెకు');

    expect(slug).toMatch(/^listing-[0-9a-f]{8}$/);
    expect(slug).not.toBe('');
  });

  it('gives two identical titles different URLs', () => {
    expect(listingSlug('Honda Activa')).not.toBe(listingSlug('Honda Activa'));
  });

  it('caps length so a 500-character title cannot produce an unusable URL', () => {
    expect(slugify('a'.repeat(500)).length).toBeLessThanOrEqual(120);
  });
});

describe('pagination', () => {
  it('computes total pages and the next-page flag', () => {
    const result = paginate([1, 2, 3], 25, 1, 10);

    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNextPage: true,
    });
  });

  it('reports at least one page when there are no results', () => {
    // A UI that renders "page 1 of 0" looks broken.
    expect(paginate([], 0, 1, 20).meta.totalPages).toBe(1);
  });

  it('clears the next-page flag on the last page', () => {
    expect(paginate([1], 21, 3, 10).meta.hasNextPage).toBe(false);
  });
});

describe('TooManyRequestsException', () => {
  it('answers 429 with a retry hint', () => {
    const exception = new TooManyRequestsException('Slow down', 30);
    const body = exception.getResponse() as Record<string, unknown>;

    expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(body.retryAfterSeconds).toBe(30);
    expect(body.error).toBe('TooManyRequests');
  });
});

describe('AuditService', () => {
  const prisma = makePrismaMock() as unknown as PrismaService;
  const audit = new AuditService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('reports only the fields that actually changed', () => {
    const changes = audit.diff(
      { title: 'Old', price: 100, city: 'Hyderabad' },
      { title: 'New', price: 100, city: 'Hyderabad' },
    );

    expect(changes).toEqual({ title: { from: 'Old', to: 'New' } });
  });

  it('detects a field being added or removed', () => {
    expect(audit.diff({ a: 1 }, { a: 1, b: 2 })).toEqual({ b: { from: undefined, to: 2 } });
  });

  it('redacts credentials before they reach the audit table', async () => {
    await audit.record({
      action: 'auth.login',
      entityType: 'User',
      entityId: 'u1',
      changes: { password: 'hunter2', refreshToken: 'abc', deviceId: 'd1' },
    });

    const created = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];

    expect(created.data.changes).toEqual({
      password: '[redacted]',
      refreshToken: '[redacted]',
      deviceId: 'd1',
    });
  });

  it('redacts nested credentials too', async () => {
    await audit.record({
      action: 'test',
      entityType: 'X',
      changes: { device: { name: 'Pixel', accessToken: 'secret' } },
    });

    const created = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];

    expect(created.data.changes).toEqual({
      device: { name: 'Pixel', accessToken: '[redacted]' },
    });
  });

  it('never throws — an audit failure must not roll back the action it describes', async () => {
    (prisma.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error('database down'));

    await expect(
      audit.record({ action: 'listing.create', entityType: 'Listing', entityId: 'l1' }),
    ).resolves.toBeUndefined();
  });
});
