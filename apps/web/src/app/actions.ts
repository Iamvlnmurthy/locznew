'use server';

import { revalidatePath } from 'next/cache';
import type { City } from '@locz/shared-types';
import type { Locale } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { setLocale, setSelectedCity, type SelectedCity } from '@/lib/session';

export async function changeLocaleAction(locale: Locale): Promise<void> {
  await setLocale(locale);
  revalidatePath('/', 'layout');
}

export async function selectCityAction(city: SelectedCity): Promise<void> {
  await setSelectedCity(city);
  revalidatePath('/', 'layout');
}

export async function searchCitiesAction(query: string, includeUpcoming = false): Promise<City[]> {
  const q = query.trim().slice(0, 60);
  if (!q) return [];

  return (
    (await apiSafe<City[]>(
      `/locations/cities?${includeUpcoming ? '' : 'launchedOnly=true&'}limit=50&q=${encodeURIComponent(q)}`,
    )) ?? []
  );
}

export interface LocationSuggestion {
  id: string;
  label: string;
  sublabel?: string;
  type: 'city' | 'pincode';
  cityId?: string;
  pincode?: string;
  name: string;
  cityName?: string;
  stateName?: string;
}

export async function searchLocationUnifiedAction(query: string): Promise<LocationSuggestion[]> {
  const q = query.trim().slice(0, 60);
  if (!q) return [];

  const [cities, pincodes] = await Promise.all([
    apiSafe<Array<{ id: string; name: string; stateName?: string; slug: string }>>(
      `/locations/cities?limit=8&q=${encodeURIComponent(q)}`,
    ),
    apiSafe<
      Array<{
        code: string;
        name: string;
        districtName?: string;
        stateName?: string;
        cityId?: string;
        cityName?: string;
      }>
    >(`/locations/pincodes?limit=12&q=${encodeURIComponent(q)}`),
  ]);

  const results: LocationSuggestion[] = [];

  if (cities) {
    for (const c of cities) {
      results.push({
        id: c.id,
        label: c.name,
        sublabel: c.stateName || 'City in India',
        type: 'city',
        cityId: c.id,
        name: c.name,
        stateName: c.stateName,
      });
    }
  }

  if (pincodes) {
    for (const p of pincodes) {
      results.push({
        id: p.code,
        label: `${p.name} (${p.code})`,
        sublabel: [p.districtName, p.stateName].filter(Boolean).join(', '),
        type: 'pincode',
        cityId: p.cityId ?? undefined,
        pincode: p.code,
        name: p.name,
        cityName: p.cityName ?? p.districtName,
        stateName: p.stateName,
      });
    }
  }

  return results.slice(0, 15);
}
