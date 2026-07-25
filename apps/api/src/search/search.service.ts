import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';
import { MeiliSearch, Index } from 'meilisearch';
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

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly client: MeiliSearch;
  private readonly indexName: string;

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    this.indexName = config.get('MEILI_LISTINGS_INDEX');
    this.client = new MeiliSearch({
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
        `Could not configure the search index at boot: ${error instanceof Error ? error.message : error}`,
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
      searchableAttributes: [
        'title',
        'brand',
        'categoryName',
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
      pagination: { maxTotalHits: 2000 },
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
        category: { select: { name: true } },
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
   * Full rebuild, streamed in batches. Used after a settings change or to repair drift;
   * because Postgres is the source of truth this is always safe to run.
   */
  async reindexAll(batchSize = 500): Promise<{ indexed: number }> {
    let cursor: string | undefined;
    let indexed = 0;

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
        await this.index.addDocuments(documents);
        indexed += documents.length;
      }

      cursor = listings[listings.length - 1]!.id;
    }

    this.logger.log(`Reindexed ${indexed} listings`);
    return { indexed };
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

    const result = await this.index.search(params.query, {
      filter: filter.length > 0 ? filter : undefined,
      sort: params.sort,
      offset: (params.page - 1) * params.limit,
      limit: params.limit,
    });

    const documents = result.hits as ListingDocument[];
    return {
      ids: documents.map((document) => document.id),
      total: result.estimatedTotalHits ?? documents.length,
      documents,
    };
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
