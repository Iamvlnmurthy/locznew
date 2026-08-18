/**
 * In-memory distance between two coordinates.
 *
 * Haversine rather than PostGIS: these points are already in memory (a listing row and the
 * viewer's origin), so a round trip to the database to compare a pair of coordinates would
 * be slower and no more accurate at this scale. The spatial index still does the heavy
 * lifting for radius *filtering* — this only labels each already-selected row with a distance.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Metres between two points on the earth. */
export function distanceMetres(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Distance from an origin to a point whose coordinates may be missing, rounded to whole
 * metres. Returns `undefined` when either the origin or the point lacks coordinates — so a
 * caller omits the field rather than reporting a false "0 m away".
 */
export function distanceMetresOrNull(
  origin: Coordinates | undefined,
  point: { latitude: number | null | undefined; longitude: number | null | undefined },
): number | undefined {
  if (!origin) return undefined;
  if (point.latitude == null || point.longitude == null) return undefined;
  return Math.round(
    distanceMetres(origin, { latitude: point.latitude, longitude: point.longitude }),
  );
}

/**
 * Keeps only items within `maxMeters`. A `maxMeters` of `undefined` means "no radius" and
 * returns everything unchanged. An item whose distance could not be measured is kept rather
 * than silently dropped — the radius filters what we can measure, it does not hide the rest.
 */
export function withinRadius<T extends { distanceMeters?: number }>(
  items: T[],
  maxMeters?: number,
): T[] {
  if (maxMeters === undefined) return items;
  return items.filter(
    (item) => item.distanceMeters === undefined || item.distanceMeters <= maxMeters,
  );
}
