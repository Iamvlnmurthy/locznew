import { MediaStatus } from '@prisma/client';
import { ModerationService } from '../src/moderation/moderation.service';

/**
 * Finding a quarantined image.
 *
 * The console had preview, approve and block, all keyed by media id, and no way to obtain
 * one: the listing queue counts a listing's images without naming them, and the public
 * media read returns only READY. So the controls existed and pointed at nothing, and every
 * quarantined image stayed quarantined even after the release route shipped.
 */
describe('ModerationService.getMediaQueue', () => {
  function build(rows: Array<Record<string, unknown>> = []) {
    const prisma = {
      listingMedia: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(rows.length),
      },
    };
    const service = new ModerationService(
      {} as never, // moderation provider
      prisma as never,
      { record: jest.fn() } as never,
      {} as never, // searchIndex
      {} as never, // tokens
      {} as never, // saved-search queue
      {} as never, // requirement-match queue
    );
    return { service, prisma };
  }

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'media-1',
      listingId: 'listing-1',
      failureReason: 'This image is awaiting a safety review.',
      createdAt: new Date('2026-08-01T10:00:00Z'),
      listing: { title: 'Iron cot', owner: { displayName: 'Ravi' } },
      ...overrides,
    };
  }

  it('returns what a moderator needs to act on an item', async () => {
    const { service } = build([row()]);

    const { items, total } = await service.getMediaQueue(1, 20);

    expect(total).toBe(1);
    expect(items[0]).toEqual({
      id: 'media-1',
      listingId: 'listing-1',
      listingTitle: 'Iron cot',
      uploaderName: 'Ravi',
      failureReason: 'This image is awaiting a safety review.',
      createdAt: new Date('2026-08-01T10:00:00Z'),
    });
  });

  it('carries no image content and no signed URL', async () => {
    const { service } = build([row()]);

    const { items } = await service.getMediaQueue(1, 20);

    // A signed URL per row would mint a live link to unreviewed content for every image on
    // the page, nearly all of which nobody opens. The console asks for a preview when a
    // moderator actually opens one.
    const keys = Object.keys(items[0]!);
    expect(keys).not.toContain('url');
    expect(keys).not.toContain('thumbUrl');
    expect(JSON.stringify(items[0]!)).not.toMatch(/http/);
  });

  it('asks only for images awaiting review, and never for held evidence', async () => {
    const { service, prisma } = build();

    await service.getMediaQueue(1, 20);

    // LEGAL_HOLD is excluded by asking only for REVIEW_REQUIRED. Held evidence belongs to
    // the restricted safety-case flow, where every look at it is logged and justified;
    // listing it here would hand it to anyone holding `listing:moderate`.
    const { where } = prisma.listingMedia.findMany.mock.calls[0][0];
    expect(where.status).toBe(MediaStatus.REVIEW_REQUIRED);
    expect(where.status).not.toBe(MediaStatus.LEGAL_HOLD);
  });

  it('leaves out media whose listing was deleted', async () => {
    const { service, prisma } = build();

    await service.getMediaQueue(1, 20);

    const { where } = prisma.listingMedia.findMany.mock.calls[0][0];
    expect(where.listing).toEqual({ deletedAt: null });
  });

  it('works the oldest first, and pages', async () => {
    const { service, prisma } = build();

    await service.getMediaQueue(3, 20);

    // Newest-first would leave the oldest items untouched indefinitely — and those are the
    // uploads somebody has already been waiting on longest.
    const call = prisma.listingMedia.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ createdAt: 'asc' });
    expect(call.skip).toBe(40);
    expect(call.take).toBe(20);
  });
});
