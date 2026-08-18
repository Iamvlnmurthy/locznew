import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Listing, NotificationType, Prisma } from '@prisma/client';
import { v7 as uuid } from 'uuid';
import { ListingsService } from '../listings/listings.service';
import { ListingSearchQueryDto } from '../listings/dto/listing.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SavedSearchDto, SaveSearchDto } from './dto/search-subscription.dto';

/** Nobody usefully watches fifty searches, and each one costs a query per new listing. */
const MAX_PER_USER = 20;

/**
 * Saved searches, and the alerts that make them worth saving.
 *
 * The point of the feature is the alert. A saved search that only reloads a results page is a
 * bookmark; what people actually want is to be told when the thing they are waiting for gets
 * posted, because the alternative is opening the app every day and usually finding nothing.
 *
 * Matching re-runs the stored filters against the single new listing rather than
 * re-implementing them. That is the whole design: a second copy of the filter rules would
 * drift from the first, and the failure would be silent — alerts that quietly stop matching
 * what the search page shows, which nobody notices because nothing errors. Instead this asks
 * `ListingsService` the same question the search page asks, narrowed to one listing id.
 */
@Injectable()
export class SearchSubscriptionsService {
  private readonly logger = new Logger(SearchSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: ListingsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string): Promise<SavedSearchDto[]> {
    const saved = await this.prisma.searchSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return saved.map((entry) => this.toDto(entry));
  }

  async create(userId: string, dto: SaveSearchDto): Promise<SavedSearchDto> {
    const count = await this.prisma.searchSubscription.count({ where: { userId } });
    if (count >= MAX_PER_USER) {
      throw new BadRequestException(
        `You can keep ${MAX_PER_USER} saved searches. Remove one to add another.`,
      );
    }

    const filters = this.filtersFrom(dto);

    const saved = await this.prisma.searchSubscription.create({
      data: {
        id: uuid(),
        userId,
        label: dto.label.trim(),
        query: dto.q?.trim() || null,
        filters: filters as Prisma.InputJsonValue,
        cityId: dto.cityId ?? null,
        isActive: true,
      },
    });

    return this.toDto(saved);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.searchSubscription.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Saved search not found');
    await this.prisma.searchSubscription.delete({ where: { id } });
  }

  async setActive(userId: string, id: string, isActive: boolean): Promise<SavedSearchDto> {
    const existing = await this.prisma.searchSubscription.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Saved search not found');

    const updated = await this.prisma.searchSubscription.update({
      where: { id },
      data: { isActive },
    });
    return this.toDto(updated);
  }

  /**
   * Tells everyone whose saved search this listing answers.
   *
   * Called when a listing first becomes visible — not on resume or republish, because an
   * alert should mean "this is new", and being told about a listing that was paused for a
   * fortnight teaches people to ignore the alerts.
   *
   * Never throws to its caller. A failure here must not fail the posting: the seller has done
   * nothing wrong, and a listing that exists without having triggered alerts is a far smaller
   * problem than one that could not be posted at all.
   */
  async notifyMatches(listing: Listing): Promise<number> {
    try {
      // Narrowed by city first, which is what the schema's `[isActive, cityId]` index is for.
      // Subscriptions with no city are included: someone watching all of India still wants
      // to hear about a listing in Hyderabad.
      const candidates = await this.prisma.searchSubscription.findMany({
        where: {
          isActive: true,
          userId: { not: listing.ownerId },
          OR: [{ cityId: listing.cityId }, { cityId: null }],
        },
      });

      /**
       * Distinct filter sets, asked once each.
       *
       * Every subscription was costing its own COUNT against the database, so publishing one
       * listing ran one query per saved search on the platform — ten thousand saved searches,
       * ten thousand queries, for a single post. Saved searches repeat heavily (the same
       * category in the same city, saved by hundreds of people), so grouping identical filter
       * sets collapses that to one query per distinct question. The question asked is still
       * `ListingsService`'s, which is the property that matters: one implementation of "does
       * this match", not two.
       */
      const verdicts = new Map<string, boolean>();
      let notified = 0;

      for (const subscription of candidates) {
        const signature = JSON.stringify([
          subscription.query,
          subscription.cityId,
          subscription.filters,
        ]);

        let matched = verdicts.get(signature);
        if (matched === undefined) {
          matched = await this.matches(subscription, listing.id);
          verdicts.set(signature, matched);
        }
        if (!matched) continue;

        // `createOnce` keys on entityId, so a user who has already been told about this
        // listing by one saved search is not told again by a second that also matches.
        const sent = await this.notifications.createOnce({
          userId: subscription.userId,
          type: NotificationType.SAVED_SEARCH_MATCH,
          title: subscription.label,
          body: listing.title,
          data: { entityId: listing.id, listingId: listing.id, subscriptionId: subscription.id },
        });
        if (sent) notified += 1;

        await this.prisma.searchSubscription.update({
          where: { id: subscription.id },
          data: { lastMatchedAt: new Date() },
        });
      }

      if (notified > 0) {
        this.logger.log(`Listing ${listing.id} matched ${notified} saved search(es)`);
      }
      return notified;
    } catch (error) {
      this.logger.error(
        `Could not match saved searches for ${listing.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  /** Does this one listing satisfy the stored filters? Asked of the search path itself. */
  private async matches(
    subscription: { query: string | null; filters: Prisma.JsonValue; cityId: string | null },
    listingId: string,
  ): Promise<boolean> {
    const stored = (subscription.filters ?? {}) as Record<string, unknown>;
    const query: Partial<ListingSearchQueryDto> = {
      ...stored,
      ...(subscription.query ? { q: subscription.query } : {}),
      ...(subscription.cityId ? { cityId: subscription.cityId } : {}),
    };

    return this.listings.matchesSavedSearch(listingId, query as ListingSearchQueryDto);
  }

  /**
   * The subset of search filters a saved search may carry.
   *
   * Explicitly listed rather than spread from the DTO, so a future search parameter cannot
   * arrive in stored filters without someone deciding it should be there — a stored filter
   * the matcher does not understand is an alert that never fires, with nothing to show for
   * it in a log.
   */
  private filtersFrom(dto: SaveSearchDto): Record<string, unknown> {
    const filters: Record<string, unknown> = {};
    const copy = <K extends keyof SaveSearchDto>(key: K) => {
      if (dto[key] !== undefined) filters[key as string] = dto[key];
    };

    copy('type');
    copy('categoryId');
    copy('localityId');
    copy('priceMin');
    copy('priceMax');
    copy('condition');
    copy('brand');
    copy('model');
    copy('yearMin');
    copy('yearMax');
    copy('bedroomsMin');
    copy('areaMin');
    copy('areaMax');
    copy('attr');

    return filters;
  }

  private toDto(entry: {
    id: string;
    label: string;
    query: string | null;
    filters: Prisma.JsonValue;
    cityId: string | null;
    isActive: boolean;
    lastMatchedAt: Date | null;
    createdAt: Date;
  }): SavedSearchDto {
    return {
      id: entry.id,
      label: entry.label,
      q: entry.query,
      cityId: entry.cityId,
      filters: (entry.filters ?? {}) as Record<string, unknown>,
      isActive: entry.isActive,
      lastMatchedAt: entry.lastMatchedAt,
      createdAt: entry.createdAt,
    };
  }
}
