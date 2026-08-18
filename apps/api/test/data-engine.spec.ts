import { osmToCategorySlug } from '../src/data-engine/category-map';
import { dedupeConfidence } from '../src/data-engine/dedupe';
import { sourceMayRunInProduction } from '../src/data-engine/data-source.service';
import { OsmOverpassConnector } from '../src/data-engine/osm-overpass.connector';
import type { DataSource } from '@prisma/client';

const baseSource = (over: Partial<DataSource>): DataSource =>
  ({
    id: 's1',
    key: 'osm-overpass',
    name: 'OSM',
    type: 'POI',
    enabled: true,
    termsReviewed: true,
    commercialUse: true,
    storagePermitted: true,
    cachingPermitted: false,
    mediaDisplay: false,
    attributionRequired: true,
    ...over,
  }) as DataSource;

describe('data engine', () => {
  describe('osmToCategorySlug', () => {
    it('maps amenities and shops to canonical LocZ slugs, unknown to null', () => {
      expect(osmToCategorySlug({ amenity: 'restaurant' })).toBe('food');
      expect(osmToCategorySlug({ amenity: 'pharmacy' })).toBe('health');
      expect(osmToCategorySlug({ shop: 'electronics' })).toBe('shopping');
      expect(osmToCategorySlug({ leisure: 'sports_centre' })).toBe('play');
      expect(osmToCategorySlug({ amenity: 'townhall' })).toBeNull();
    });
  });

  describe('dedupeConfidence', () => {
    const a = {
      name: 'ABC Dental Clinic',
      latitude: 17.44,
      longitude: 78.35,
      phone: '+91 90000 11111',
    };

    it('is decisive when the phone number matches', () => {
      const b = { name: 'ABC Dental Care', latitude: 17.6, longitude: 78.6, phone: '090000 11111' };
      expect(dedupeConfidence(a, b)).toBeGreaterThan(0.85);
    });

    it('is high for a near-identical name a few metres apart', () => {
      const b = { name: 'ABC Dental Clinic', latitude: 17.4401, longitude: 78.3501, phone: null };
      expect(dedupeConfidence(a, b)).toBeGreaterThan(0.55);
    });

    it('is low for an unrelated place far away', () => {
      const b = { name: 'Blue Sky Cafe', latitude: 17.9, longitude: 78.9, phone: null };
      expect(dedupeConfidence(a, b)).toBeLessThan(0.3);
    });
  });

  describe('sourceMayRunInProduction (licence gate)', () => {
    it('refuses an unreviewed or non-commercial source', () => {
      expect(sourceMayRunInProduction(baseSource({ termsReviewed: false }))).toBe(false);
      expect(sourceMayRunInProduction(baseSource({ commercialUse: false }))).toBe(false);
      expect(sourceMayRunInProduction(baseSource({ enabled: false }))).toBe(false);
    });

    it('requires storage permission for stored (POI) sources but not realtime feeds', () => {
      expect(sourceMayRunInProduction(baseSource({ type: 'POI', storagePermitted: false }))).toBe(
        false,
      );
      expect(
        sourceMayRunInProduction(baseSource({ type: 'WEATHER', storagePermitted: false })),
      ).toBe(true);
    });

    it('allows a fully-reviewed, storage-permitted POI source', () => {
      expect(sourceMayRunInProduction(baseSource({}))).toBe(true);
    });
  });

  describe('OsmOverpassConnector.normalize', () => {
    const connector = new OsmOverpassConnector();

    it('normalizes a node with name + tags into a POI with provenance', () => {
      const poi = connector.normalize({
        type: 'node',
        id: 42,
        lat: 17.44,
        lon: 78.35,
        tags: { name: 'Cafe Nine', amenity: 'cafe', phone: '+91 90000 22222' },
      });
      expect(poi).not.toBeNull();
      expect(poi!.name).toBe('Cafe Nine');
      expect(poi!.categorySlug).toBe('food');
      expect(poi!.provenance.externalId).toBe('node/42');
      expect(poi!.provenance.attributionText).toContain('OpenStreetMap');
    });

    it('skips records with no name or no coordinates', () => {
      expect(connector.normalize({ type: 'node', id: 1, lat: 17, lon: 78, tags: {} })).toBeNull();
      expect(connector.normalize({ type: 'node', id: 2, tags: { name: 'X' } })).toBeNull();
    });
  });
});
