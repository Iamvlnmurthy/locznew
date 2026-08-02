import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { Category, City } from '@locz/shared-types';
import { getMessageGroup } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale, getSelectedCity } from '@/lib/session';
import { BusinessForm } from './business-form';

export const metadata: Metadata = {
  title: 'List your business',
  description:
    'Add your business to LocZ. Be found by customers nearby, and post offers and job vacancies.',
  // Indexable, unlike the rest of the posting flow: "add my business to LocZ" is a real
  // query, and this is its landing page.
  alternates: { canonical: '/business/new' },
};

export default async function NewBusinessPage() {
  const [user, city, locale] = await Promise.all([
    getCurrentUser(),
    getSelectedCity(),
    getLocale(),
  ]);
  if (!user) redirect('/signin?next=%2Fbusiness%2Fnew');

  const [categories, cities] = await Promise.all([
    apiSafe<Category[]>('/categories?listingType=BUSINESS_LISTING', { revalidate: 3600 }),
    apiSafe<City[]>('/locations/cities?launchedOnly=true&limit=50', { revalidate: 3600 }),
  ]);

  return (
    <BusinessForm
      categories={categories ?? []}
      cities={cities ?? []}
      defaultCityId={city?.id}
      defaultCityLabel={city?.name}
      userId={user.id}
      labels={{
        ...getMessageGroup(locale, 'businessOnboarding'),
        searchCity: getMessageGroup(locale, 'location').searchCity,
        noCityMatches: getMessageGroup(locale, 'location').noCityMatches,
      }}
    />
  );
}
