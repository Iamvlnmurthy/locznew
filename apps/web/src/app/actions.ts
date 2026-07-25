'use server';

import { revalidatePath } from 'next/cache';
import type { Locale } from '@/i18n';
import { setLocale, setSelectedCity, type SelectedCity } from '@/lib/session';

export async function changeLocaleAction(locale: Locale): Promise<void> {
  await setLocale(locale);
  revalidatePath('/', 'layout');
}

export async function selectCityAction(city: SelectedCity): Promise<void> {
  await setSelectedCity(city);
  revalidatePath('/', 'layout');
}
