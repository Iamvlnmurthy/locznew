'use server';

import { apiSafe } from '@/lib/api';

export interface NearbyBusiness {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string | null;
  pincode: string | null;
  logoUrl?: string | null;
  publicBrandKey?: string | null;
  isClaimable?: boolean;
  addressLine?: string | null;
  description?: string | null;
  listingCount?: number;
  viewCount?: number;
  distanceMeters?: number;
  verificationStatus: string;
  claimStatus: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface ApiPage {
  items: NearbyBusiness[];
  meta: { page: number; hasNextPage: boolean; total: number };
}

export interface BusinessPage {
  items: NearbyBusiness[];
  page: number;
  hasNextPage: boolean;
  total: number;
}

/**
 * One page of businesses, 20 at a time, scoped to the viewer's location. When coordinates are
 * present it hits the geo endpoint (nearest first, exact distance on each); otherwise it falls
 * back to the pincode list. Runs on the server so the httpOnly session cookie reaches the API —
 * the browser never calls the API directly. The client calls this on scroll to append a page.
 */
export async function loadNearbyBusinesses(args: {
  q?: string;
  pincode?: string;
  cityId?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  categoryId?: string;
  area?: string;
  verifiedOnly?: boolean;
  page: number;
}): Promise<BusinessPage> {
  const query = new URLSearchParams({ page: String(args.page), limit: '20' });
  if (args.q) query.set('q', args.q);
  if (args.pincode) query.set('pincode', args.pincode);
  if (args.categoryId) query.set('categoryId', args.categoryId);
  if (args.area) query.set('area', args.area);
  if (args.verifiedOnly) query.set('verifiedOnly', 'true');

  let path: string;
  if (args.latitude !== undefined && args.longitude !== undefined) {
    query.set('latitude', String(args.latitude));
    query.set('longitude', String(args.longitude));
    query.set('radiusKm', String(args.radiusKm ?? 25));
    path = `/businesses/nearby?${query.toString()}`;
  } else {
    if (args.cityId) query.set('cityId', args.cityId);
    query.set('sort', 'recommended');
    path = `/businesses?${query.toString()}`;
  }

  const result = await apiSafe<ApiPage>(path, { auth: true });
  return {
    items: result?.items ?? [],
    page: result?.meta.page ?? args.page,
    hasNextPage: result?.meta.hasNextPage ?? false,
    total: result?.meta.total ?? 0,
  };
}
