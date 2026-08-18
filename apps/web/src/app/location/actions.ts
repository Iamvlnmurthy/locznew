'use server';

import type { City } from '@locz/shared-types';
import { apiSafe } from '@/lib/api';

export interface ResolvedPincode {
  code: string;
  name: string;
  districtName: string;
  stateName: string;
  latitude: number;
  longitude: number;
  cityId: string | null;
  cityName: string | null;
  listingCount?: number;
}

/**
 * Resolves device coordinates to a launched city. Returns `city: null` when the visitor
 * is outside every launched area — the picker then asks them to choose rather than
 * snapping them to a city hundreds of kilometres away.
 */
export interface ResolvedLocality {
  id: string;
  name: string;
  slug: string;
  distanceMeters: number;
}

export async function resolveCoordinatesAction(
  latitude: number,
  longitude: number,
): Promise<{
  city: City | null;
  nearbyLocalities: ResolvedLocality[];
  pincode: ResolvedPincode | null;
}> {
  const [result, pincodeResult] = await Promise.all([
    apiSafe<{ city: City | null; nearbyLocalities?: ResolvedLocality[] }>('/locations/resolve', {
      method: 'POST',
      body: { latitude, longitude },
    }),
    apiSafe<{ pincode: ResolvedPincode | null }>('/locations/resolve/pincode', {
      method: 'POST',
      body: { latitude, longitude },
    }),
  ]);

  return {
    city: result?.city ?? null,
    // Nearest first — the picker labels the choice "Gachibowli, Hyderabad" rather than
    // just the city, so a person recognises exactly where they are browsing.
    nearbyLocalities: result?.nearbyLocalities ?? [],
    pincode: pincodeResult?.pincode ?? null,
  };
}

/**
 * Looks up a pincode. Returns null for anything the dataset does not know, which the
 * picker reports as a typo rather than an outage — every real Indian pincode is present.
 */
export async function resolvePincodeAction(code: string): Promise<ResolvedPincode | null> {
  if (!/^\d{6}$/.test(code)) return null;

  return (
    (await apiSafe<ResolvedPincode>(`/locations/pincodes/${code}`, { revalidate: 3600 })) ?? null
  );
}
