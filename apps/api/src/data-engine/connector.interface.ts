/**
 * The one shape every external source implements (plan Part 41). A connector turns a remote
 * feed into normalized LocZ candidates + provenance; it never writes to production tables
 * directly — the ingestion pipeline dedupes and upserts. Keeping this uniform stops every
 * integration from becoming an unrelated script.
 */

export interface Provenance {
  sourceKey: string;
  externalId: string;
  originalUrl?: string;
  retrievedAt: Date;
  sourcePublishedAt?: Date;
  attributionText?: string;
  /** Whether the source's licence permits storing/caching this record's media. */
  mediaRightsState: 'EXTERNAL' | 'PERMITTED_CACHE';
  confidence: number; // 0..1 confidence in the record's correctness/location
}

/** A normalized point-of-interest candidate, before dedup against canonical entities. */
export interface NormalizedPoi {
  name: string;
  /** LocZ canonical category slug (never the raw source taxonomy — Part: OSM tags stay hidden). */
  categorySlug: string | null;
  latitude: number | null;
  longitude: number | null;
  phone?: string | null;
  website?: string | null;
  addressText?: string | null;
  provenance: Provenance;
}

export interface ConnectorFetchArgs {
  /** Bounding box or centre+radius the scheduler wants ingested (a geo cell in practice). */
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface SourceConnector {
  /** Stable key that matches a DataSource.key row. */
  readonly key: string;
  /** Pull raw records for an area. Returns raw payloads; normalization is separate. */
  fetch(args: ConnectorFetchArgs): Promise<unknown[]>;
  /** Pure: turn one raw payload into a normalized candidate (or null to skip). Unit-testable. */
  normalize(raw: unknown): NormalizedPoi | null;
  /** Lightweight availability check for the health model. */
  healthCheck(): Promise<boolean>;
}
