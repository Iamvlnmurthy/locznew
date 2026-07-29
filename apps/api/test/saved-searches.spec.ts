import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { SearchSubscriptionsService } from '../src/search-subscriptions/search-subscriptions.service';

/**
 * Saved searches and the alerts that make them worth saving.
 *
 * The cases below are about who gets told and who does not. Both directions matter: an alert
 * that never arrives makes the feature pointless, and one that arrives wrongly trains people
 * to ignore every alert after it.
 */
describe('SearchSubscriptionsService', () => {
  const listing = {
    id: 'listing-1',
    ownerId: 'seller-1',
    cityId: 'city-1',
    title: 'Maruti Swift 2019',
  };

  function build({
    subscriptions = [
      {
        id: 'sub-1',
        userId: 'buyer-1',
        label: 'Swifts in Hyderabad',
        query: 'swift',
        filters: { priceMax: 500_000 },
        cityId: 'city-1',
      },
    ],
    matches = true,
    existingCount = 0,
    alreadyNotified = false,
  } = {}) {
    const prisma = {
      searchSubscription: {
        findMany: jest.fn().mockResolvedValue(subscriptions),
        count: jest.fn().mockResolvedValue(existingCount),
        create: jest.fn().mockImplementation(({ data }: { data: object }) => ({
          ...data,
          isActive: true,
          lastMatchedAt: null,
          createdAt: new Date(0),
        })),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(subscriptions[0] ?? null),
      },
    };
    const listings = { matchesSavedSearch: jest.fn().mockResolvedValue(matches) };
    const notifications = { createOnce: jest.fn().mockResolvedValue(!alreadyNotified) };

    return {
      service: new SearchSubscriptionsService(
        prisma as never,
        listings as never,
        notifications as never,
      ),
      prisma,
      listings,
      notifications,
    };
  }

  describe('alerting on a new listing', () => {
    it('tells a watcher whose search the listing answers', async () => {
      const { service, notifications } = build();

      await expect(service.notifyMatches(listing as never)).resolves.toBe(1);
      expect(notifications.createOnce).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'buyer-1',
          type: NotificationType.SAVED_SEARCH_MATCH,
          // Keyed on the listing, so a second saved search that also matches does not
          // produce a second notification about the same listing.
          data: expect.objectContaining({ entityId: 'listing-1' }),
        }),
      );
    });

    it('says nothing when the listing does not answer the search', async () => {
      const { service, notifications } = build({ matches: false });

      await expect(service.notifyMatches(listing as never)).resolves.toBe(0);
      expect(notifications.createOnce).not.toHaveBeenCalled();
    });

    it('never alerts the seller about their own listing', async () => {
      const { service, prisma } = build();

      await service.notifyMatches(listing as never);

      expect(prisma.searchSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: { not: 'seller-1' } }),
        }),
      );
    });

    it('considers searches with no city as well as this city', async () => {
      const { service, prisma } = build();

      await service.notifyMatches(listing as never);

      // Someone watching all of India still wants to hear about a listing in Hyderabad.
      const where = prisma.searchSubscription.findMany.mock.calls[0][0].where as {
        OR: unknown[];
      };
      expect(where.OR).toEqual([{ cityId: 'city-1' }, { cityId: null }]);
    });

    it('asks the search path whether it matches rather than deciding itself', async () => {
      const { service, listings } = build();

      await service.notifyMatches(listing as never);

      // A second implementation of the filters would drift from the first, and the drift
      // would be silent: alerts quietly disagreeing with the results page.
      expect(listings.matchesSavedSearch).toHaveBeenCalledWith(
        'listing-1',
        expect.objectContaining({ q: 'swift', cityId: 'city-1', priceMax: 500_000 }),
      );
    });

    it('does not fail the posting when matching goes wrong', async () => {
      const { service, prisma } = build();
      prisma.searchSubscription.findMany.mockRejectedValue(new Error('database down'));

      // The seller has done nothing wrong. A listing that exists without having triggered
      // alerts is a far smaller problem than one that could not be posted.
      await expect(service.notifyMatches(listing as never)).resolves.toBe(0);
    });

    it('counts only alerts that were actually sent', async () => {
      const { service } = build({ alreadyNotified: true });

      await expect(service.notifyMatches(listing as never)).resolves.toBe(0);
    });
  });

  describe('managing saved searches', () => {
    it('stores only the filters the matcher understands', async () => {
      const { service, prisma } = build();

      await service.create('buyer-1', {
        label: 'Swifts',
        q: 'swift',
        priceMax: 500_000,
        cityId: 'city-1',
        // Not a filter the matcher honours; it must not reach storage.
        sort: 'price_asc',
      } as never);

      const stored = prisma.searchSubscription.create.mock.calls[0][0].data as {
        filters: Record<string, unknown>;
        query: string;
      };
      expect(stored.filters).toEqual({ priceMax: 500_000 });
      expect(stored.query).toBe('swift');
    });

    it('refuses to keep an unbounded number of them', async () => {
      const { service } = build({ existingCount: 20 });

      // Each saved search costs a query per new listing, and nobody usefully watches fifty.
      await expect(service.create('buyer-1', { label: 'One more' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('will not touch somebody else’s saved search', async () => {
      const { service, prisma } = build();
      prisma.searchSubscription.findFirst.mockResolvedValue(null);

      await expect(service.remove('buyer-2', 'sub-1')).rejects.toThrow(NotFoundException);
      await expect(service.setActive('buyer-2', 'sub-1', false)).rejects.toThrow(NotFoundException);
      expect(prisma.searchSubscription.delete).not.toHaveBeenCalled();
    });
  });
});
