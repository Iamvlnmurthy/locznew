import { Injectable, Logger } from '@nestjs/common';
import { osmToCategorySlug } from './category-map';
import { ConnectorFetchArgs, NormalizedPoi, SourceConnector } from './connector.interface';

/** One element as returned by the Overpass API. */
interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * OpenStreetMap connector via the Overpass API. Open data, so it is the default seed source
 * for POIs (Businesses/Food/Health/Services/Play/Mobility) — the categories the plan says are
 * "automatically seedable". Attribution is required (© OpenStreetMap contributors, ODbL); the
 * DataSource row carries it and the licence gate.
 *
 * For production-scale, all-India coverage this should move to a local OSM extract rather than
 * the shared Overpass servers (plan Part: OSM) — this connector keeps the same interface either
 * way, so only `fetch()` changes.
 */
@Injectable()
export class OsmOverpassConnector implements SourceConnector {
  readonly key = 'osm-overpass';
  private readonly logger = new Logger(OsmOverpassConnector.name);
  private readonly endpoint = 'https://overpass-api.de/api/interpreter';

  async fetch(args: ConnectorFetchArgs): Promise<OverpassElement[]> {
    const bbox = `${args.south},${args.west},${args.north},${args.east}`;
    // POIs that carry a name and one of the tags we map. `out center` gives ways a point.
    const query = `[out:json][timeout:60];(
      node["name"]["amenity"](${bbox});
      node["name"]["shop"](${bbox});
      node["name"]["leisure"](${bbox});
      node["name"]["healthcare"](${bbox});
      way["name"]["amenity"](${bbox});
    );out center 2000;`;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'LocZ/1.0 (+https://locz.in; data-engine)',
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!response.ok) {
      throw new Error(`Overpass ${response.status}`);
    }
    const json = (await response.json()) as { elements?: OverpassElement[] };
    return json.elements ?? [];
  }

  /** Pure — one Overpass element to a normalized POI, or null when it has no usable name/point. */
  normalize(raw: unknown): NormalizedPoi | null {
    const el = raw as OverpassElement;
    const tags = el?.tags;
    const name = tags?.name?.trim();
    if (!name) return null;

    const latitude = el.lat ?? el.center?.lat ?? null;
    const longitude = el.lon ?? el.center?.lon ?? null;
    if (latitude === null || longitude === null) return null;

    const addressText = [tags?.['addr:housenumber'], tags?.['addr:street'], tags?.['addr:suburb']]
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      name,
      categorySlug: osmToCategorySlug(tags ?? {}),
      latitude,
      longitude,
      phone: tags?.phone ?? tags?.['contact:phone'] ?? null,
      website: tags?.website ?? tags?.['contact:website'] ?? null,
      addressText: addressText || null,
      provenance: {
        sourceKey: this.key,
        externalId: `${el.type}/${el.id}`,
        originalUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        retrievedAt: new Date(),
        attributionText: '© OpenStreetMap contributors (ODbL)',
        mediaRightsState: 'EXTERNAL',
        confidence: 0.7,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.endpoint}?data=${encodeURIComponent('[out:json];out count;')}`,
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
