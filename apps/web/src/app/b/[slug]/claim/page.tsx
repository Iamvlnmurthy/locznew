import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import type { Category } from '@locz/shared-types';
import { getMessageGroup } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { BusinessClaimForm } from './claim-form';

interface ClaimableBusiness {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  cityName: string;
}

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function BusinessClaimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/b/${slug}/claim`)}`);

  const [business, categories] = await Promise.all([
    apiSafe<ClaimableBusiness>(`/businesses/${encodeURIComponent(slug)}`, { auth: true }),
    apiSafe<Category[]>('/categories?listingType=BUSINESS_LISTING', { revalidate: 3600 }),
  ]);
  if (!business) notFound();

  return (
    <BusinessClaimForm
      business={business}
      categories={categories ?? []}
      labels={getMessageGroup(locale, 'businessClaim')}
    />
  );
}
