import type { Metadata } from 'next';
import type { City } from '@locz/shared-types';
import { getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getLocale, getSelectedCity } from '@/lib/session';
import { LocationPicker } from './location-picker';

export const metadata: Metadata = {
  title: 'Choose your location',
  robots: { index: false, follow: true },
};

export default async function LocationPage() {
  const [locale, cities, current] = await Promise.all([
    getLocale(),
    apiSafe<City[]>('/locations/cities?limit=50', { revalidate: 3600 }),
    getSelectedCity(),
  ]);

  const t = getTranslator(locale);

  return (
    <div className="container">
      <h1 className="page-title">{t('location.label')}</h1>
      <p className="page-subtitle">{t('location.searchCity')}</p>

      <LocationPicker
        cities={cities ?? []}
        currentCityId={current?.id ?? null}
        labels={{
          useCurrent: t('location.useCurrent'),
          searchCity: t('location.searchCity'),
          detecting: t('location.detecting'),
          permissionDenied: t('location.permissionDenied'),
          outsideLaunchArea: t('location.outsideLaunchArea'),
        }}
      />
    </div>
  );
}
