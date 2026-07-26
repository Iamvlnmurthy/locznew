import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import type { Category, City } from '@locz/shared-types';
import { getMessageGroup } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { BusinessManageForm, type ManagedBusiness } from './business-manage-form';
import { StaffAccess, type BusinessStaff } from './staff-access';
import { VerificationPanel } from './verification-panel';

export const metadata: Metadata = {
  title: 'Manage business',
  robots: { index: false, follow: false },
};

interface BusinessSummary {
  id: string;
  slug: string;
}

export default async function ManageBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, locale] = await Promise.all([params, getCurrentUser(), getLocale()]);
  if (!user) {
    redirect(`/signin?next=${encodeURIComponent(`/business/manage/${id}`)}`);
  }

  const mine = await apiSafe<BusinessSummary[]>('/businesses/mine', { auth: true });
  const summary = mine?.find((business) => business.id === id);
  if (!summary) notFound();

  const [business, categories, cities, staff] = await Promise.all([
    apiSafe<ManagedBusiness>(`/businesses/${summary.slug}`, { auth: true }),
    apiSafe<Category[]>('/categories?listingType=BUSINESS_LISTING', { revalidate: 3600 }),
    apiSafe<City[]>('/locations/cities?launchedOnly=true&limit=50', { revalidate: 3600 }),
    apiSafe<BusinessStaff[]>(`/businesses/${id}/staff`, { auth: true }),
  ]);
  if (!business?.isOwner) notFound();
  const labels = getMessageGroup(locale, 'businessManage');

  return (
    <div className="business-owner-page">
      <BusinessManageForm
        business={business}
        categories={categories ?? []}
        cities={cities ?? []}
        labels={labels}
      />
      <div className="container business-owner-trust">
        <VerificationPanel business={business} labels={labels} />
        <StaffAccess businessId={business.id} staff={staff ?? []} labels={labels} />
      </div>
    </div>
  );
}
