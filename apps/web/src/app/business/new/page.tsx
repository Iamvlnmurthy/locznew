import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { Category, City } from '@locz/shared-types';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getSelectedCity } from '@/lib/session';
import { BusinessForm } from './business-form';

export const metadata: Metadata = {
  title: 'List your business',
  description:
    'Add your business to LocZ for free. Be found by customers nearby, and post offers and job vacancies.',
  // Indexable, unlike the rest of the posting flow: "add my business to LocZ" is a real
  // query, and this is its landing page.
  alternates: { canonical: '/business/new' },
};

export default async function NewBusinessPage() {
  const [user, city] = await Promise.all([getCurrentUser(), getSelectedCity()]);
  if (!user) redirect('/signin?next=%2Fbusiness%2Fnew');

  const [categories, cities] = await Promise.all([
    apiSafe<Category[]>('/categories?listingType=BUSINESS_LISTING', { revalidate: 3600 }),
    apiSafe<City[]>('/locations/cities?launchedOnly=true&limit=50', { revalidate: 3600 }),
  ]);

  return (
    <div className="container">
      <BusinessForm categories={categories ?? []} cities={cities ?? []} defaultCityId={city?.id} />
    </div>
  );
}
