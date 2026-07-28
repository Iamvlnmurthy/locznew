import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import type { Category, City, ListingType } from '@locz/shared-types';
import { getMessageGroup, getTranslator } from '@/i18n';
import { ApiError, api, apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { PostForm, type PostFormInitialListing } from '../../post-form';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: getTranslator(locale)('post.editTitle'),
    robots: { index: false, follow: false },
  };
}

interface EditableListing {
  id: string;
  slug: string;
  status: string;
  type: ListingType;
  title: string;
  description: string;
  categoryId: string;
  cityId?: string;
  cityName: string;
  pincodeCode?: string | null;
  contactPreference: string;
  marketplace?: Record<string, unknown> | null;
  job?: Record<string, unknown> | null;
  offer?: Record<string, unknown> | null;
  service?: Record<string, unknown> | null;
  rental?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  buyerRequirement?: Record<string, unknown> | null;
}

async function loadEditableListing(id: string): Promise<EditableListing | null> {
  try {
    return await api<EditableListing>(`/listings/${encodeURIComponent(id)}`, { auth: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, locale, user] = await Promise.all([params, getLocale(), getCurrentUser()]);
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/post/${id}/edit`)}`);

  const [listing, categories, cities] = await Promise.all([
    loadEditableListing(id),
    apiSafe<Category[]>('/categories', { revalidate: 3600 }),
    apiSafe<City[]>('/locations/cities?launchedOnly=true&limit=50', { revalidate: 3600 }),
  ]);
  if (!listing) notFound();

  const t = getTranslator(locale);
  const availableCities = cities ?? [];
  const matchedCity = availableCities.find((city) => city.name === listing.cityName);
  const detailKey =
    listing.type === 'BUYER_REQUIREMENT'
      ? 'buyerRequirement'
      : (listing.type.toLowerCase() as 'job' | 'offer' | 'service' | 'rental' | 'event');
  const initialListing: PostFormInitialListing = {
    id: listing.id,
    slug: listing.slug,
    status: listing.status,
    type: listing.type,
    title: listing.title,
    description: listing.description,
    categoryId: listing.categoryId,
    cityId: listing.cityId ?? matchedCity?.id,
    cityName: listing.cityName,
    pincodeCode: listing.pincodeCode,
    contactPreference: listing.contactPreference,
    details: {
      ...(listing.marketplace ?? {}),
      ...((listing[detailKey] as Record<string, unknown> | null | undefined) ?? {}),
    },
  };

  return (
    <div className="container">
      <PostForm
        categories={categories ?? []}
        cities={availableCities}
        initialListing={initialListing}
        labels={{
          title: t('post.title'),
          subtitle: t('post.subtitle'),
          fieldTitle: t('post.field.title'),
          titleHint: t('post.field.titleHint'),
          fieldDescription: t('post.field.description'),
          descriptionHint: t('post.field.descriptionHint'),
          fieldCity: t('post.field.city'),
          citySearch: t('location.searchCity'),
          noCityMatches: t('location.noCityMatches'),
          fieldPincode: t('post.field.pincode'),
          fieldPincodeHint: t('post.field.pincodeHint'),
          fieldCategory: t('post.steps.category'),
          contactPreference: t('post.field.contactPreference'),
          photos: t('post.field.photos'),
          photosHint: t('post.field.photosHint'),
          publish: t('post.publish'),
          publishing: t('post.publishing'),
          saveDraft: t('post.saveDraft'),
          successPublished: t('post.successPublished'),
          successPending: t('post.successPending'),
          editTitle: t('post.editTitle'),
          editSubtitle: t('post.editSubtitle'),
          saveChanges: t('post.saveChanges'),
          savingChanges: t('post.savingChanges'),
          updateSuccess: t('post.updateSuccess'),
          moderationWarning: t('post.moderationWarning'),
          removedCannotEdit: t('post.removedCannotEdit'),
          draftSaved: t('post.draftSaved'),
          restoreTitle: t('post.restoreTitle'),
          restoreBody: t('post.restoreBody'),
          restore: t('post.restore'),
          discard: t('post.discard'),
          preview: t('post.preview'),
          previewTitle: t('post.previewTitle'),
          closePreview: t('post.closePreview'),
          wizard: getMessageGroup(locale, 'post.wizard'),
          detailFields: getMessageGroup(locale, 'post.detailFields'),
          contactOptions: getMessageGroup(locale, 'post.contact'),
          types: getMessageGroup(locale, 'post.type'),
        }}
      />
    </div>
  );
}
