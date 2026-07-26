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

export async function searchCitiesAction(query: string): Promise<City[]> {
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return [];

  return (
    (await apiSafe<City[]>(
      `/locations/cities?launchedOnly=true&limit=50&q=${encodeURIComponent(q)}`,
    )) ?? []
  );
}
