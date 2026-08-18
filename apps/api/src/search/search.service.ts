import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';
import { Index, Meilisearch, type EnqueuedTaskPromise } from 'meilisearch';
import { AppConfig } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../media/storage.service';

/**
 * One flat document per listing. Meilisearch is a derived index, never a source of
 * truth (ADR-0005) — every field here is reproducible from PostgreSQL.
 */
export interface ListingDocument {
  id: string;
  slug: string;
  type: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string;
  /// What people type when they want this category, in all three languages.
  categoryTerms: string[];
  subcategoryId: string | null;
  cityId: string;
  cityName: string;
  localityId: string | null;
  localityName: string | null;
  districtId: string | null;
  stateId: string | null;
  price: number | null;
  isFree: boolean;
  condition: string | null;
  brand: string | null;
  isFeatured: boolean;
  isSponsored: boolean;
  isVerifiedBusiness: boolean;
  businessId: string | null;
  viewCount: number;
  saveCount: number;
  publishedAtTimestamp: number;
  expiresAtTimestamp: number | null;
  thumbUrl: string | null;
  _geo?: { lat: number; lng: number };
}

/**
 * Attributes where matching part of a word is a real signal rather than a coincidence.
 *
 * Meilisearch prefix-matches the last word of a query, which is what makes search-as-you-type
 * work: `iph` finds every iPhone. That is obviously right for a title, a brand or a category,
 * because those name the thing being sold and a shopper types the beginning of the name.
 *
 * It is obviously wrong for a description. A description is up to 2000 characters of ordinary
 * prose, so the chance that some unrelated word merely *starts with* what you typed is high
 * and grows with the length of the text — which is how `car` came to return an iPhone whose
 * description said the phone had been "carefully used for two years".
 */
const IDENTITY_ATTRIBUTES = new Set(['title', 'brand', 'categoryName', 'localityName', 'cityName']);

/**
 * How many hits to read past the page being served, so that discarding a coincidence still
 * leaves a full page. Bounded because the work is proportional to it and the coincidences
 * this removes are rare — the common query drops nothing and pays only for a wider read.
 */
const OVERFETCH = 4;
/**
 * The deepest raw window read in one query.
 *
 * With a page size of 20 this covers the first ten pages at full overfetch, which is far past
 * where anybody browses and comfortably inside the engine's own `maxTotalHits`. Beyond it the
 * page is served from whatever the window held, which is the same trade the ceiling below
 * already makes.
 */
const MAX_WINDOW = 800;

/**
 * The deepest result Meilisearch will return, and therefore the largest total we may claim.
 *
 * Meilisearch stops at `maxTotalHits` no matter what the query matched. With this set to 2000
 * and a page size of 20, page 100 was the last page with anything on it — while the response
 * still reported 4,117 results, so the hundred pages after it existed in the interface and
 * were empty in reality.
 *
 * Reporting a reachable total instead is the honest fix: the count becomes "2000" rather than
 * a number the product cannot deliver. The database path has no such ceiling and keeps its
 * true count, which is not an inconsistency to paper over — each path now reports what it can
 * actually serve, and `usedSearchIndex` already tells the caller which one answered.
 *
 * Shared with `configureIndex` so the ceiling and the setting cannot drift apart, which is
 * exactly how this kind of defect survives a settings change.
 */
const MAX_TOTAL_HITS = 2000;

/** Letters and digits in every script, so this behaves the same in Telugu as in English. */
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/**
 * The character on one side of a match, given a **byte** offset.
 *
 * Meilisearch reports `_matchesPosition` in bytes, not characters — verified against this
 * index, where "excellent" in `iPhone 13, 128 GB — excellent condition` is reported at 22
 * while its character index is 20, the two differing by the em dash's extra bytes. Reading
 * those offsets as character indices happens to work for pure ASCII and then quietly breaks
 * on the first accented or non-Latin character, which in this product means it would break
 * on Telugu and Hindi listings while every English test kept passing.
 *
 * Slicing a few bytes and decoding can land mid-character at the far end; taking the
 * adjacent character from the decoded edge avoids that, and anything undecodable is treated
 * as a boundary, which errs towards keeping the result.
 */
function adjacentCharacter(
  text: string,
  byteOffset: number,
  direction: 'before' | 'after',
): string {
  const bytes = Buffer.from(text, 'utf8');
  if (direction === 'after') {
    if (byteOffset >= bytes.length) return '';
    return [...bytes.subarray(byteOffset, byteOffset + 4).toString('utf8')][0] ?? '';
  }
  if (byteOffset <= 0) return '';
  const decoded = [...bytes.subarray(Math.max(0, byteOffset - 4), byteOffset).toString('utf8')];
  return decoded[decoded.length - 1] ?? '';
}

/** Whether a match covers a whole word rather than the beginning of a longer one. */
export function isWholeWord(text: string, start: number, length: number): boolean {
  const before = adjacentCharacter(text, start, 'before');
  const after = adjacentCharacter(text, start + length, 'after');
  return !WORD_CHARACTER.test(before) && !WORD_CHARACTER.test(after);
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly client: Meilisearch;
  private readonly indexName: string;

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    this.indexName = config.get('MEILI_LISTINGS_INDEX');
    this.client = new Meilisearch({
      host: config.get('MEILI_HOST'),
      apiKey: config.get('MEILI_MASTER_KEY') || undefined,
    });
  }

  /**
   * Settings are applied at boot and are idempotent. Doing it in code rather than by
   * hand means a fresh Meilisearch container is correctly configured with no runbook step.
   */
  onModuleInit(): void {
    // Deliberately not awaited. A slow or unreachable Meilisearch must never delay the
    // API accepting traffic — the database path serves search either way, and the
    // nightly rebuild repairs an index that was configured late.
    void this.configureIndex().catch((error: unknown) => {
      this.logger.warn(
        `Could not configure the search index at boot: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private get index(): Index<ListingDocument> {
    return this.client.index<ListingDocument>(this.indexName);
  }

  async configureIndex(indexName = this.indexName): Promise<void> {
    await this.client.createIndex(indexName, { primaryKey: 'id' }).catch(() => undefined);
    const index = this.client.index<ListingDocument>(indexName);

    await index.updateSettings({
      // Order matters: a match in the title outranks the same word in the description.
      /**
       * Words that carry no meaning in a local search, and must not be required to match.
       *
       * `matchingStrategy: all` below requires every query word to appear, which is right —
       * it stopped "iphone 13 madhapur" returning 4,171 listings by ignoring two of the three
       * words. But it also meant "best biryani near me" returned nothing at all, because no
       * listing contains "best", "near" or "me". That is how people actually type, and
       * answering their most natural query with an empty page is worse than either problem.
       *
       * Stop words fix it without weakening the rule: these are removed before matching, so
       * "best biryani near me" is matched as "biryani" while "iphone 13 madhapur" still
       * requires all three. Every remaining word still has to mean something.
       *
       * Includes the Hindi and Telugu equivalents, because the same sentence shape appears in
       * all three languages.
       */
      stopWords: [
        'a',
        'an',
        'the',
        'in',
        'at',
        'on',
        'of',
        'for',
        'to',
        'and',
        'or',
        'is',
        'are',
        'my',
        'me',
        'i',
        'we',
        'you',
        'near',
        'nearby',
        'around',
        'close',
        'closest',
        'nearest',
        'best',
        'good',
        'top',
        'cheap',
        'cheapest',
        'low',
        'price',
        'here',
        'this',
        'that',
        'any',
        'some',
        'available',
        'need',
        'want',
        'looking',
        'shop',
        'shops',
        'place',
        'places',
        'పక్కన',
        'దగ్గర',
        'నాకు',
        'కావాలి',
        'మంచి',
        'पास',
        'नजदीक',
        'मुझे',
        'चाहिए',
        'अच्छा',
        'सबसे',
      ],
      searchableAttributes: [
        'title',
        'brand',
        'categoryName',
        'categoryTerms',
        'description',
        'localityName',
        'cityName',
      ],
      filterableAttributes: [
        'type',
        'categoryId',
        'subcategoryId',
        'cityId',
        'localityId',
        'districtId',
        'stateId',
        'price',
        'isFree',
        'condition',
        'brand',
        'isFeatured',
        'isVerifiedBusiness',
        'businessId',
        'publishedAtTimestamp',
        'expiresAtTimestamp',
        '_geo',
      ],
      sortableAttributes: ['price', 'publishedAtTimestamp', 'viewCount', 'saveCount', '_geo'],
      rankingRules: [
        'words',
        'typo',
        'proximity',
        'attribute',
        'sort',
        'exactness',
        // Paid placement moves a listing up among equally relevant results — it never
        // outranks relevance itself.
        'isFeatured:desc',
        'publishedAtTimestamp:desc',
      ],
      // Indian users search in transliterated Telugu and Hindi; typo tolerance on short
      // words causes more harm than good, so the minimum sizes are raised.
      typoTolerance: {
        enabled: true,
        minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 },
      },
      pagination: { maxTotalHits: MAX_TOTAL_HITS },
    });
  }

  /**
   * Builds the document straight from the database. The job carries only an id, so a
   * stale queued job can never write stale content.
   */
  async buildDocument(listingId: string): Promise<ListingDocument | null> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      include: {
        category: { select: { name: true, searchTerms: true } },
        city: { select: { name: true } },
        locality: { select: { name: true } },
        marketplace: true,
        business: { select: { verificationStatus: true } },
        media: { where: { isPrimary: true }, take: 1 },
      },
    });

    // Anything not published must not be findable — including listings that were
    // published and then paused, sold or removed.
    if (!listing || listing.status !== ListingStatus.PUBLISHED || listing.visibility !== 'PUBLIC') {
      return null;
    }

    const primary = listing.media[0];

    return {
      id: listing.id,
      slug: listing.slug,
      type: listing.type,
      title: listing.title,
      description: listing.description.slice(0, 2000),
      categoryId: listing.categoryId,
      categoryName: listing.category.name,
      // Carries the category's vocabulary onto every listing in it, so a search for what a
      // shop sells finds the shop even when its own words never mention it.
      categoryTerms: listing.category.searchTerms ?? [],
      subcategoryId: listing.subcategoryId,
      cityId: listing.cityId,
      cityName: listing.city.name,
      localityId: listing.localityId,
      localityName: listing.locality?.name ?? null,
      districtId: listing.districtId,
      stateId: listing.stateId,
      price: listing.marketplace?.price ? Number(listing.marketplace.price) : null,
      isFree: listing.marketplace?.isFree ?? false,
      condition: listing.marketplace?.condition ?? null,
      brand: listing.marketplace?.brand ?? null,
      isFeatured: listing.isFeatured,
      isSponsored: listing.isSponsored,
      isVerifiedBusiness: listing.business?.verificationStatus === 'VERIFIED',
      businessId: listing.businessId,
      viewCount: listing.viewCount,
      saveCount: listing.saveCount,
      publishedAtTimestamp: (listing.publishedAt ?? listing.createdAt).getTime(),
      expiresAtTimestamp: listing.expiresAt?.getTime() ?? null,
      thumbUrl: primary?.thumbKey ? this.storage.publicUrl(primary.thumbKey) : null,
      ...(listing.latitude && listing.longitude
        ? { _geo: { lat: Number(listing.latitude), lng: Number(listing.longitude) } }
        : {}),
    };
  }

  /**
   * Upsert-or-remove. A listing that has left PUBLISHED produces a null document, which
   * is the signal to delete it from the index — so pausing a listing removes it from
   * search through the very same code path that added it.
   */
  async indexListing(listingId: string): Promise<'indexed' | 'removed'> {
    const document = await this.buildDocument(listingId);

    if (!document) {
      await this.index.deleteDocument(listingId);
      return 'removed';
    }

    await this.index.addDocuments([document]);
    await this.prisma.listing.update({
      where: { id: listingId },
      data: { searchIndexedAt: new Date() },
    });
    return 'indexed';
  }

  async removeListing(listingId: string): Promise<void> {
    await this.index.deleteDocument(listingId);
  }

  /**
   * Full rebuild, streamed into a temporary index and swapped into place. Upserting into
   * the live index is not a rebuild: documents deleted from PostgreSQL would survive there
   * forever. The swap also avoids returning an empty search result while a large catalogue
   * is being repopulated.
   */
  async reindexAll(batchSize = 500): Promise<{ indexed: number }> {
    const replacementName = `${this.indexName}_rebuild_${Date.now()}`;
    await this.waitForTask(
      this.client.createIndex(replacementName, { primaryKey: 'id' }),
      'create replacement search index',
    );
    await this.configureIndex(replacementName);
    const replacement = this.client.index<ListingDocument>(replacementName);

    let cursor: string | undefined;
    let indexed = 0;

    try {
      for (;;) {
        const listings = await this.prisma.listing.findMany({
          where: { status: ListingStatus.PUBLISHED, deletedAt: null, visibility: 'PUBLIC' },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: batchSize,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });

        if (listings.length === 0) break;

        const documents = (
          await Promise.all(listings.map((listing) => this.buildDocument(listing.id)))
        ).filter((document): document is ListingDocument => document !== null);

        if (documents.length > 0) {
          await this.waitForTask(
            replacement.addDocuments(documents),
            'populate replacement search index',
          );
          indexed += documents.length;
        }

        cursor = listings[listings.length - 1]!.id;
      }

      await this.waitForTask(
        this.client.swapIndexes([{ indexes: [this.indexName, replacementName], rename: false }]),
        'activate replacement search index',
      );
      await this.waitForTask(this.client.deleteIndex(replacementName), 'remove stale search index');

      this.logger.log(`Reindexed ${indexed} listings`);
      return { indexed };
    } catch (error) {
      await this.client
        .deleteIndex(replacementName)
        .waitTask()
        .catch(() => undefined);
      throw error;
    }
  }

  private async waitForTask(task: EnqueuedTaskPromise, operation: string): Promise<void> {
    const completed = await task.waitTask();
    if (completed.status !== 'succeeded') {
      throw new Error(`${operation} failed: ${completed.error?.message ?? completed.status}`);
    }
  }

  async searchListings(params: {
    query: string;
    filters: string[];
    sort?: string[];
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    page: number;
    limit: number;
  }): Promise<{ ids: string[]; total: number; documents: ListingDocument[] }> {
    const filter = [...params.filters];

    if (params.latitude !== undefined && params.longitude !== undefined && params.radiusKm) {
      filter.push(`_geoRadius(${params.latitude}, ${params.longitude}, ${params.radiusKm * 1000})`);
    }

    /**
     * Read from the top of the results, not from the page's own offset.
     *
     * The window exists so that discarding a coincidence still leaves a full page — but the
     * discards happen *inside* the window, so the raw offset a page ends at is not
     * `page × limit`. Reading page two from offset 20 after page one had consumed 25 raw hits
     * to produce its 20 rows re-served five of them, which is the duplicate-across-pages
     * failure the listing queries carry a tie-breaker to avoid.
     *
     * Paging over the filtered sequence instead means reading `page × limit` survivors and
     * keeping the last `limit`. Bounded by MAX_WINDOW, which is what caps the work: past that
     * depth the engine's own `maxTotalHits` ceiling has been reached anyway.
     */
    const wanted = params.page * params.limit;
    const window = Math.min(wanted * OVERFETCH, MAX_WINDOW);

    const result = await this.index.search(params.query, {
      filter: filter.length > 0 ? filter : undefined,
      sort: params.sort,
      offset: 0,
      limit: window,
      // Needed to tell a real match from a coincidence; see `isRelevant`.
      showMatchesPosition: true,
      // Every word the user typed has to appear.
      //
      // Meilisearch's default is `last`, which drops query terms from the end until something
      // matches. It never returns nothing, and that is the problem: `iphone 13 madhapur`
      // returned 4,171 listings by ignoring both "13" and "madhapur", and a nonsense
      // hyphenated identifier returned 12,377 by ignoring nearly all of it. The user is told
      // these are results for what they typed.
      //
      // `all` makes the words mean something: the same queries return 1 and 0. It also brings
      // the index in line with the database path, which already required every word — the two
      // were answering the same question differently, which is not a difference a user can see
      // or predict.
      //
      // Measured before changing: single-word queries are unaffected (`iphone` 4,171 either
      // way) and a natural phrase barely moves (`samsung double door fridge` 4,117 → 4,114),
      // so the recall this gives up is recall that was never relevant.
      matchingStrategy: 'all',
    });

    const hits = result.hits;
    const relevant = hits.filter((hit) => this.isRelevant(hit));
    const discarded = hits.length - relevant.length;

    if (discarded > 0) {
      this.logger.debug(
        `Discarded ${discarded} coincidental match(es) for "${params.query}" — ` +
          'matched only part of a word in a description',
      );
    }

    // The slice belonging to this page, taken from the filtered sequence so consecutive
    // pages neither repeat nor skip.
    const documents = relevant.slice(wanted - params.limit, wanted);

    // The engine counted the coincidences, so the count has to lose them too. Anything else
    // shows "1 result" above an empty page. `estimatedTotalHits` was already an estimate;
    // subtracting what this window proved wrong makes it a better one, and the case that
    // matters most — every hit discarded, as with `car` — becomes exactly zero.
    const estimated = result.estimatedTotalHits ?? hits.length;
    // Clamped to what the engine will actually hand out; see MAX_TOTAL_HITS.
    const total = Math.min(Math.max(0, estimated - discarded), MAX_TOTAL_HITS);

    return {
      ids: documents.map((document) => document.id),
      total,
      documents,
    };
  }

  /**
   * Whether a hit is a real answer to the query or an accident of prefix matching.
   *
   * A hit qualifies if it matched any identity attribute — title, brand, category, place —
   * where matching the start of a word is exactly what a shopper means. A hit that matched
   * *only* the description qualifies only if it matched a whole word there.
   *
   * Deliberately generous in every uncertain case: a hit with no reported positions is kept,
   * because the alternative is silently hiding listings when Meilisearch changes how it
   * reports matches. This removes coincidences, and it is not a relevance ranker.
   */
  private isRelevant(
    hit: ListingDocument & { _matchesPosition?: Record<string, unknown> },
  ): boolean {
    const positions = hit._matchesPosition;
    if (!positions) return true;

    const matchedAttributes = Object.keys(positions);
    if (matchedAttributes.length === 0) return true;
    if (matchedAttributes.some((attribute) => IDENTITY_ATTRIBUTES.has(attribute))) return true;

    const description = positions.description;
    if (!Array.isArray(description)) return true;

    return description.some((match) => {
      const { start, length } = match as { start?: number; length?: number };
      if (typeof start !== 'number' || typeof length !== 'number') return true;
      return isWholeWord(hit.description ?? '', start, length);
    });
  }

  async health(): Promise<{ available: boolean; documents?: number }> {
    try {
      const stats = await this.index.getStats();
      return { available: true, documents: stats.numberOfDocuments };
    } catch {
      return { available: false };
    }
  }
}
