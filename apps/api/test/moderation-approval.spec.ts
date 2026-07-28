import { ListingStatus, ModerationStatus } from '@prisma/client';
import { ModerationService } from '../src/moderation/moderation.service';

/**
 * Approving a listing from the review queue.
 *
 * This had no coverage at all, which is how it reached production publishing a listing
 * without recording why: the state change and the moderation record ran as two separate
 * writes, so a failure in between left a live listing with nothing in its history explaining
 * how it got there — and, because the index enqueue came after, one nobody could find either.
 */
describe('ModerationService.approveListing', () => {
  const pending: {
    id: string;
    ownerId: string;
    status: ListingStatus;
    publishedAt: Date | null;
  } = {
    id: 'listing-1',
    ownerId: 'owner-1',
    status: ListingStatus.PENDING_REVIEW,
    publishedAt: null,
  };

  function build({
    listing = pending,
    createFails = false,
  }: { listing?: typeof pending | null; createFails?: boolean } = {}) {
    const moderationAction = {
      create: jest.fn(createFails ? () => Promise.reject(new Error('invalid uuid')) : async () => ({})),
    };
    const listingModel = {
      findFirst: jest.fn().mockResolvedValue(listing),
      update: jest.fn().mockImplementation(async ({ data }: { data: object }) => ({
        ...listing,
        ...data,
      })),
    };

    const prisma = {
      listing: listingModel,
      moderationAction,
      // Faithful to the real thing in the way that matters here: the callback's writes are
      // discarded if it throws, so the assertions below can distinguish "committed" from
      // "attempted".
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const attempted: Array<() => void> = [];
        const tx = {
          listing: {
            update: jest.fn(async (args: { data: object }) => {
              attempted.push(() => listingModel.update(args));
              return { ...listing, ...args.data };
            }),
          },
          moderationAction,
        };
        const result = await fn(tx);
        attempted.forEach((commit) => commit());
        return result;
      }),
    };

    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const searchIndex = { enqueueIndex: jest.fn().mockResolvedValue(undefined) };

    return {
      service: new ModerationService(
        { name: 'test', evaluate: jest.fn() } as never,
        prisma as never,
        audit as never,
        searchIndex as never,
        {} as never,
      ),
      prisma,
      audit,
      searchIndex,
      listingModel,
      moderationAction,
    };
  }

  it('publishes, records the decision and makes the listing findable', async () => {
    const { service, listingModel, moderationAction, searchIndex } = build();

    await service.approveListing('listing-1', 'moderator-1', 'Looks fine');

    expect(listingModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ListingStatus.PUBLISHED,
          moderationStatus: ModerationStatus.APPROVED,
        }),
      }),
    );
    expect(moderationAction.create).toHaveBeenCalled();
    // Publishing without indexing is the failure that looks fine in the database and reads
    // as a broken product to whoever posted it.
    expect(searchIndex.enqueueIndex).toHaveBeenCalledWith('listing-1');
  });

  it('does not publish when the decision cannot be recorded', async () => {
    const { service, listingModel, searchIndex } = build({ createFails: true });

    await expect(service.approveListing('listing-1', 'moderator-1')).rejects.toThrow();

    expect(listingModel.update).not.toHaveBeenCalled();
    expect(searchIndex.enqueueIndex).not.toHaveBeenCalled();
  });

  it('records an approval with no moderator as automated', async () => {
    const { service, moderationAction, audit } = build();

    await service.approveListing('listing-1', null, 'Released by a maintenance run');

    expect(moderationAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isAutomated: true, moderatorId: null }),
      }),
    );
    // The audit trail must not imply a person made a call that no person made.
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorRole: 'SYSTEM', actorId: undefined }),
    );
  });

  it('is idempotent once the listing is already published', async () => {
    const { service, prisma, searchIndex } = build({
      listing: { ...pending, status: ListingStatus.PUBLISHED },
    });

    await service.approveListing('listing-1', 'moderator-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(searchIndex.enqueueIndex).not.toHaveBeenCalled();
  });
});
