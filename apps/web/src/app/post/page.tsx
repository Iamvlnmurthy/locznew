import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { Category, City, ListingType } from '@locz/shared-types';
import { getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale, getSelectedCity } from '@/lib/session';
import { PostForm } from './post-form';

export const metadata: Metadata = {
  title: 'Post a free ad',
  robots: { index: false, follow: true },
};

const VALID_TYPES: ListingType[] = [
  'PRODUCT',
  'JOB',
  'OFFER',
  'SERVICE',
  'RENTAL',
  'BUYER_REQUIREMENT',
  'EVENT',
];

/**
 * `?type=JOB` preselects the listing type, so a "Post a job" link anywhere on the site
 * lands on the right form rather than making the user find it in a dropdown.
 */
export default async function PostPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const [params, locale, user, city] = await Promise.all([
    searchParams,
    getLocale(),
    getCurrentUser(),
    getSelectedCity(),
  ]);

  // Posting requires an account; browsing never does.
  if (!user) redirect('/signin?next=%2Fpost');

  const t = getTranslator(locale);

  const requested = params.type?.toUpperCase() as ListingType | undefined;
  const defaultType = requested && VALID_TYPES.includes(requested) ? requested : 'PRODUCT';

  // The whole tree, unfiltered — the form narrows it as the user switches type, which
  // avoids a round trip on every change.
  const [categories, cities] = await Promise.all([
    apiSafe<Category[]>('/categories', { revalidate: 3600 }),
    apiSafe<City[]>('/locations/cities?launchedOnly=true&limit=50', { revalidate: 3600 }),
  ]);

  return (
    <div className="container">
      <PostForm
        categories={categories ?? []}
        cities={cities ?? []}
        defaultCityId={city?.id}
        defaultPincode={city?.pincode}
        defaultType={defaultType}
        labels={{
          title: t('post.title'),
          subtitle: t('post.subtitle'),
          fieldTitle: t('post.field.title'),
          titleHint: t('post.field.titleHint'),
          fieldDescription: t('post.field.description'),
          descriptionHint: t('post.field.descriptionHint'),
          fieldCity: t('post.field.city'),
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
          contactOptions: {
            IN_APP_ONLY: t('post.contact.IN_APP_ONLY'),
            PHONE_AND_IN_APP: t('post.contact.PHONE_AND_IN_APP'),
            PHONE: t('post.contact.PHONE'),
            WHATSAPP: t('post.contact.WHATSAPP'),
          },
          types: {
            PRODUCT: t('post.type.PRODUCT'),
            JOB: t('post.type.JOB'),
            OFFER: t('post.type.OFFER'),
            SERVICE: t('post.type.SERVICE'),
            RENTAL: t('post.type.RENTAL'),
            BUYER_REQUIREMENT: t('post.type.BUYER_REQUIREMENT'),
            EVENT: t('post.type.EVENT'),
          },
        }}
      />
    </div>
  );
}
