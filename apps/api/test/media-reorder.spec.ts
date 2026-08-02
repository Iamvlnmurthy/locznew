import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MediaService } from '../src/media/media.service';

/**
 * Reordering a listing's images.
 *
 * The first image is the cover, so this is not a cosmetic operation: it decides the single
 * photograph most buyers ever see. The cases below are the ones where getting it wrong is
 * invisible in the database and obvious to a seller.
 */
describe('MediaService.reorder', () => {
  function build({
    listing = { ownerId: 'owner-1' },
    media = [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  }: { listing?: { ownerId: string } | null; media?: Array<{ id: string }> } = {}) {
    const prisma = {
      listing: { findFirst: jest.fn().mockResolvedValue(listing) },
      listingMedia: {
        findMany: jest.fn().mockResolvedValue(media),
        update: jest.fn().mockImplementation((args: unknown) => args),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    // Only Prisma is exercised here; the rest of the collaborators are never reached on
    // this path, so they are stubs rather than mocks with behaviour to keep in step.
    const service = new MediaService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      // Audit is written on release; these cases do not exercise it.
      { record: jest.fn() } as never,
    );
    // The return value re-reads the listing; that path is not what these cases are about.
    jest.spyOn(service, 'listForListing').mockResolvedValue([]);

    return { service, prisma };
  }

  it('writes positions in the order given and makes the first the cover', async () => {
    const { service, prisma } = build();

    await service.reorder('listing-1', 'owner-1', ['c', 'a', 'b']);

    const writes = prisma.$transaction.mock.calls[0][0] as Array<{
      where: { id: string };
      data: { sortOrder: number; isPrimary: boolean };
    }>;
    expect(writes.map((w) => [w.where.id, w.data.sortOrder, w.data.isPrimary])).toEqual([
      ['c', 0, true],
      ['a', 1, false],
      ['b', 2, false],
    ]);
  });

  it('refuses an order that leaves an image out', async () => {
    const { service, prisma } = build();

    // The omitted images keep their old sortOrder, so positions collide — and an omitted
    // image that was the cover keeps isPrimary, leaving two covers. The summary query then
    // takes whichever row comes back first, so the same listing shows a different
    // photograph on different requests.
    await expect(service.reorder('listing-1', 'owner-1', ['a', 'b'])).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an order that names the same image twice', async () => {
    const { service } = build();

    await expect(service.reorder('listing-1', 'owner-1', ['a', 'a', 'b'])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses an image that belongs to another listing', async () => {
    const { service } = build();

    await expect(service.reorder('listing-1', 'owner-1', ['a', 'b', 'z'])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses somebody else’s listing', async () => {
    const { service } = build();

    await expect(service.reorder('listing-1', 'someone-else', ['a', 'b', 'c'])).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('reports a missing listing as missing', async () => {
    const { service } = build({ listing: null });

    await expect(service.reorder('listing-1', 'owner-1', ['a'])).rejects.toThrow(NotFoundException);
  });
});
