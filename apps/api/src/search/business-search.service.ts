import { Injectable, Logger } from '@nestjs/common';
import { Meilisearch } from 'meilisearch';
import { AppConfig } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';
import { SEARCH_STOP_WORDS } from './search-vocabulary';

export interface BusinessDocument {
  id: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  /** The category's vocabulary — what makes a scraped shop findable by what it sells. */
  categoryTerms: string[];
  businessType: string;
  claimStatus: string;
  cityId: string | null;
  cityName: string | null;
  localityName: string | null;
  pincodeCode: string | null;
  isVerified: boolean;
  isClaimed: boolean;
  _geo?: { lat: number; lng: number };
}

/** Matches the listings index, so one query cannot be more forgiving than the other. */
const MAX_TOTAL_HITS = 1_000;

/**
 * Businesses in their own search index.
 *
 * Until now only listings were searchable, so the platform's central promise did not work:
 * somebody searching "biryani" could find a classified ad for a rice cooker but never the
 * hotel down the road. Four million imported businesses would have been invisible.
 *
 * A separate index rather than a shared one with a type facet. Two reasons. Relevance
 * scoring is per index, so mixing four million businesses into the listings index would
 * dilute every listing query — a shop and a for-sale ad are not competing to answer the same
 * question. And the vision asks for results grouped by kind, which is natural with two
 * indexes and awkward with one.
 *
 * The rules are otherwise deliberately identical to the listings index: the same stop words,
 * the same typo tolerance, the same matching strategy. A user cannot see which index
 * answered them, so any difference in how forgiving the two are would read as the search
 * being unpredictable.
 */
@Injectable()
export class BusinessSearchService {
  private readonly logger = new Logger(BusinessSearchService.name);
  private readonly client: Meilisearch;
  private readonly indexName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {
    this.client = new Meilisearch({
      host: this.config.get('MEILI_HOST'),
      apiKey: this.config.get('MEILI_MASTER_KEY'),
    });
    // Derived from the listings index name so a deployment cannot end up with one pointing
    // at a different environment than the other.
    this.indexName = `${this.config.get('MEILI_LISTINGS_INDEX')}_businesses`;
  }

  private get index() {
    return this.client.index<BusinessDocument>(this.indexName);
  }

  async configureIndex(indexName = this.indexName): Promise<void> {
    await this.client.createIndex(indexName, { primaryKey: 'id' }).catch(() => undefined);

    await this.client.index<BusinessDocument>(indexName).updateSettings({
      // Shared with the listings index rather than copied, so the two can never disagree
      // about which words are meaningless.
      stopWords: SEARCH_STOP_WORDS,
      searchableAttributes: [
        'name',
        'categoryName',
        // Above description on purpose: an imported shop has no description at all, and its
        // category vocabulary is the only thing that can answer "biryani".
        'categoryTerms',
        'description',
        'localityName',
        'cityName',
      ],
      filterableAttributes: [
        'categoryId',
        'businessType',
        'claimStatus',
        'cityId',
        'pincodeCode',
        'isVerified',
        'isClaimed',
        '_geo',
      ],
      sortableAttributes: ['_geo'],
      rankingRules: [
        'words',
        'typo',
        'proximity',
        'attribute',
        'sort',
        'exactness',
        // A business somebody has claimed and verified is more useful than an unclaimed
        // directory record of the same shop — but only among results that already match.
        'isVerified:desc',
        'isClaimed:desc',
      ],
      typoTolerance: {
        enabled: true,
        minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 },
      },
      pagination: { maxTotalHits: MAX_TOTAL_HITS },
    });
  }

  /**
   * Builds the document for one business, or null when it should not be searchable.
   *
   * Returning null rather than throwing lets a rebuild skip a business that was deleted
   * mid-run without losing the rest of the batch.
   */
  async buildDocument(businessId: string): Promise<BusinessDocument | null> {
    const business = await this.prisma.business.findFirst({
      where: { id: businessId, deletedAt: null, isActive: true },
      include: {
        category: { select: { name: true, searchTerms: true } },
        city: { select: { name: true } },
        address: { select: { locality: { select: { name: true } } } },
      },
    });

    if (!business) return null;

    return {
      id: business.id,
      slug: business.slug,
      name: business.name,
      description: business.description ?? '',
      categoryId: business.categoryId,
      categoryName: business.category.name,
      categoryTerms: business.category.searchTerms ?? [],
      businessType: business.businessType,
      claimStatus: business.claimStatus,
      cityId: business.cityId,
      cityName: business.city?.name ?? null,
      localityName: business.address?.locality?.name ?? null,
      pincodeCode: business.pincodeCode,
      isVerified: business.verificationStatus === 'VERIFIED',
      // An imported record nobody has claimed is still shown — it is real, and it is why the
      // directory exists — but it ranks below a business somebody stands behind.
      isClaimed: business.ownerId !== null,
      ...(business.latitude && business.longitude
        ? { _geo: { lat: Number(business.latitude), lng: Number(business.longitude) } }
        : {}),
    };
  }

  async indexBusiness(businessId: string): Promise<void> {
    const document = await this.buildDocument(businessId);
    if (!document) {
      await this.removeBusiness(businessId);
      return;
    }
    await this.index.addDocuments([document]);
  }

  async removeBusiness(businessId: string): Promise<void> {
    await this.index.deleteDocument(businessId).catch(() => undefined);
  }

  /**
   * Searches businesses. Returns ids in relevance order for the caller to hydrate.
   *
   * Ids rather than documents, matching the listings path: the index is derived state and
   * PostgreSQL is the source of truth, so what is shown to a user is always re-read from the
   * database (ADR-0005). An index a moment out of date then shows nothing wrong, only fewer
   * results than it might have.
   */
  async search(params: {
    query: string;
    cityId?: string;
    pincode?: string;
    categoryId?: string;
    businessType?: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    page: number;
    limit: number;
  }): Promise<{ ids: string[]; total: number }> {
    const filter: string[] = [];
    if (params.cityId) filter.push(`cityId = "${params.cityId}"`);
    if (params.pincode) filter.push(`pincodeCode = "${params.pincode}"`);
    if (params.categoryId) filter.push(`categoryId = "${params.categoryId}"`);
    if (params.businessType) filter.push(`businessType = "${params.businessType}"`);
    if (params.latitude !== undefined && params.longitude !== undefined && params.radiusKm) {
      filter.push(`_geoRadius(${params.latitude}, ${params.longitude}, ${params.radiusKm * 1000})`);
    }

    const result = await this.index.search(params.query, {
      filter: filter.length > 0 ? filter : undefined,
      offset: (params.page - 1) * params.limit,
      limit: params.limit,
      // The same rule as listings: every word the user typed has to appear, with the stop
      // words above removing the ones that carry no meaning.
      matchingStrategy: 'all',
      ...(params.latitude !== undefined && params.longitude !== undefined
        ? { sort: [`_geoPoint(${params.latitude}, ${params.longitude}):asc`] }
        : {}),
    });

    return {
      ids: result.hits.map((hit: BusinessDocument) => hit.id),
      total: result.estimatedTotalHits ?? result.hits.length,
    };
  }

  /**
   * Rebuilds the whole index from the database.
   *
   * Builds into a replacement and swaps, so search is never briefly empty. The swap is
   * verified before the old index is dropped: a swap that silently does nothing once left
   * the live index empty while the API reported it as healthy, and deleting the replacement
   * at that point destroys the only good copy.
   */
  async reindexAll(batchSize = 500): Promise<{ indexed: number }> {
    // The live index has to exist before it can be swapped into, and on the very first
    // rebuild it does not. Creating it here is idempotent and costs nothing on later runs —
    // without it the first rebuild fails at the verification step, having already built a
    // perfectly good replacement.
    await this.configureIndex(this.indexName);

    const replacementName = `${this.indexName}_rebuild_${Date.now()}`;
    await this.configureIndex(replacementName);
    const replacement = this.client.index<BusinessDocument>(replacementName);

    let cursor: string | undefined;
    let indexed = 0;

    try {
      for (;;) {
        const businesses = await this.prisma.business.findMany({
          where: { deletedAt: null, isActive: true },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: batchSize,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });

        if (businesses.length === 0) break;

        const documents = (
          await Promise.all(businesses.map((business) => this.buildDocument(business.id)))
        ).filter((document): document is BusinessDocument => document !== null);

        if (documents.length > 0) {
          await replacement.addDocuments(documents).waitTask();
          indexed += documents.length;
        }

        cursor = businesses[businesses.length - 1]!.id;
      }

      await this.client
        .swapIndexes([{ indexes: [this.indexName, replacementName], rename: false }])
        .waitTask();

      // Verify before destroying. The replacement now holds the *old* content if the swap
      // worked, so a count matching what was just written means it did not.
      const live = await this.index.getStats();
      if (indexed > 0 && live.numberOfDocuments === 0) {
        throw new Error(
          `Swap did not take effect: the live index is empty after writing ${indexed} businesses. ` +
            'Leaving the replacement in place rather than deleting the only good copy.',
        );
      }

      await this.client.deleteIndex(replacementName).waitTask();
      this.logger.log(`Reindexed ${indexed} businesses`);
      return { indexed };
    } catch (error) {
      this.logger.error(
        `Business reindex failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async status(): Promise<{ available: boolean; indexedDocuments?: number; businesses: number }> {
    const businesses = await this.prisma.business.count({
      where: { deletedAt: null, isActive: true },
    });

    try {
      const stats = await this.index.getStats();
      return { available: true, indexedDocuments: stats.numberOfDocuments, businesses };
    } catch {
      return { available: false, businesses };
    }
  }
}
