import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { Category, City } from '@locz/shared-types';
import { getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale, getSelectedCity } from '@/lib/session';
import { PostForm } from './post-form';

export const metadata: Metadata = {
  title: 'Post a free ad',
  robots: { index: false, follow: true },
};

export default async function PostPage() {
  const [locale, user, city] = await Promise.all([
    getLocale(),
    getCurrentUser(),
    getSelectedCity(),
  ]);

  // Posting requires an account; browsing never does.
  if (!user) redirect('/signin?next=%2Fpost');

  const t = getTranslator(locale);

  const [categories, cities] = await Promise.all([
    apiSafe<Category[]>('/categories?listingType=PRODUCT', { revalidate: 3600 }),
    apiSafe<City[]>('/locations/cities?launchedOnly=true&limit=50', { revalidate: 3600 }),
  ]);

  return (
    <div className="container">
      <PostForm
        categories={categories ?? []}
        cities={cities ?? []}
        defaultCityId={city?.id}
        labels={{
          title: t('post.title'),
          subtitle: t('post.subtitle'),
          fieldTitle: t('post.field.title'),
          titleHint: t('post.field.titleHint'),
          fieldDescription: t('post.field.description'),
          descriptionHint: t('post.field.descriptionHint'),
          fieldPrice: t('post.field.price'),
          priceFree: t('post.field.priceFree'),
          negotiable: t('post.field.negotiable'),
          fieldCity: t('post.field.city'),
          fieldCategory: t('post.steps.category'),
          contactPreference: t('post.field.contactPreference'),
          photos: t('post.field.photos'),
          photosHint: t('post.field.photosHint'),
          publish: t('post.publish'),
          publishing: t('post.publishing'),
          saveDraft: t('post.saveDraft'),
          successPublished: t('post.successPublished'),
          successPending: t('post.successPending'),
          conditionLabel: t('listing.condition'),
          contactOptions: {
            IN_APP_ONLY: t('post.contact.IN_APP_ONLY'),
            PHONE_AND_IN_APP: t('post.contact.PHONE_AND_IN_APP'),
            PHONE: t('post.contact.PHONE'),
            WHATSAPP: t('post.contact.WHATSAPP'),
          },
        }}
      />
    </div>
  );
}
