'use server';

import { apiSafe } from '@/lib/api';

export interface NearbyBusiness {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string | null;
  pincode: string | null;
  verificationStatus: string;
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
 * One page of businesses scoped to a pincode (or city), 20 at a time. Runs on the server so
 * the httpOnly session cookie can reach the API — the browser never calls the API directly.
 * The client component calls this on scroll to append the next page.
 */
export async function loadNearbyBusinesses(args: {
  q?: string;
  pincode?: string;
  cityId?: string;
  page: number;
}): Promise<BusinessPage> {
  const query = new URLSearchParams({ page: String(args.page), limit: '20', sort: 'recommended' });
  if (args.q) query.set('q', args.q);
  if (args.pincode) query.set('pincode', args.pincode);
  if (args.cityId) query.set('cityId', args.cityId);

  const result = await apiSafe<ApiPage>(`/businesses?${query.toString()}`, { auth: true });
  return {
    items: result?.items ?? [],
    page: result?.meta.page ?? args.page,
    hasNextPage: result?.meta.hasNextPage ?? false,
    total: result?.meta.total ?? 0,
  };
}
