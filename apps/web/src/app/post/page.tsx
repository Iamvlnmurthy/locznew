import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { Category, City, ListingType } from '@locz/shared-types';
import { getMessageGroup, getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { hydrateCategoryAttributes } from '@/lib/category-attributes';
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
const WIZARD_KEYS = [
  'freeToPost',
  'progressLabel',
  'choose',
  'chooseHint',
  'describe',
  'describeHint',
  'review',
  'reviewHint',
  'step1Label',
  'step1Title',
  'step1Hint',
  'listingType',
  'categoryPlaceholder',
  'noCategories',
  'categoryHint',
  'continue',
  'step2Label',
  'step2Title',
  'step2Hint',
  'titlePlaceholder',
  'descriptionPlaceholder',
  'usefulDetails',
  'back',
  'reviewDetails',
  'step3Label',
  'step3Title',
  'step3Hint',
  'cityPlaceholder',
  'contactPrivacy',
  'readyToPublish',
  'listingTitle',
  'free',
  'photosNext',
  'photosEssential',
  'photosOptional',
  'guideEyebrow',
  'guide1Title',
  'guide1Body',
  'guide2Title',
  'guide2Body',
  'guide3Title',
  'guide3Body',
  'guideMinutes',
  'guideNoFees',
  'guidePrivacy',
  'trustTitle',
  'trustBody',
  'successLiveKicker',
  'successReviewKicker',
  'successLiveTitle',
  'successReviewTitle',
  'finalTouch',
  'addBestPhotos',
  'photoAdvice',
  'viewAd',
  'myAds',
  'choosePhotos',
  'photoFormats',
  'preparingPhoto',
  'photoReady',
  'removePhoto',
  'processImageError',
  'uploadFailed',
  'networkError',
] as const;
const DETAIL_FIELD_KEYS = [
  'acceptedCondition',
  'anythingWorking',
  'applyInApp',
  'applyMethod',
  'applyPhone',
  'applyWalkIn',
  'applyWebsite',
  'areaSquareFeet',
  'availability',
  'availabilityPlaceholder',
  'bathrooms',
  'baths',
  'bedBathArea',
  'beds',
  'brandOptional',
  'charges',
  'claimMethod',
  'claimPlaceholder',
  'companyName',
  'condition',
  'conditionFair',
  'conditionGood',
  'conditionLikeNew',
  'conditionNew',
  'conditionParts',
  'contract',
  'couponOptional',
  'dailyWage',
  'deposit',
  'discountHint',
  'employmentType',
  'entry',
  'eventEnd',
  'experienceYears',
  'flat',
  'freeEntry',
  'freelance',
  'from',
  'fullTime',
  'fullyFurnished',
  'furnishing',
  'giveAwayFree',
  'goodBetter',
  'house',
  'hybrid',
  'internship',
  'likeNewBetter',
  'maximum',
  'maximumBudget',
  'maximumCharge',
  'maximumSalary',
  'minimum',
  'monthlyRent',
  'neededByOptional',
  'negotiable',
  'newOnly',
  'offerEndDate',
  'offerPrice',
  'office',
  'onSite',
  'openings',
  'organiser',
  'partTime',
  'pgHostel',
  'preferredTenant',
  'price',
  'prices',
  'pricingUnit',
  'propertyType',
  'remote',
  'rentDeposit',
  'room',
  'salaryHint',
  'salaryRange',
  'semiFurnished',
  'servicePlaceholder',
  'serviceType',
  'shop',
  'showSalary',
  'squareFeet',
  'startsEnds',
  'temporary',
  'tenantPlaceholder',
  'ticketPrice',
  'to',
  'unfurnished',
  'upTo',
  'usualPrice',
  'validDates',
  'venue',
  'visitCustomer',
  'walkInPlaceholder',
  'websitePlaceholder',
  'workplaceType',
  'yourBudget',
] as const;

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
  const [categoryTree, cities] = await Promise.all([
    apiSafe<Category[]>('/categories', { revalidate: 3600 }),
    apiSafe<City[]>('/locations/cities?launchedOnly=true&limit=50', { revalidate: 3600 }),
  ]);
  const categories = await hydrateCategoryAttributes(categoryTree ?? []);

  return (
    <div className="container">
      <PostForm
        categories={categories ?? []}
        cities={cities ?? []}
        defaultCityId={city?.id}
        defaultCityLabel={city?.name}
        defaultPincode={city?.pincode}
        defaultType={defaultType}
        locale={locale}
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
          attributes: getMessageGroup(locale, 'post.attributes'),
          wizard: Object.fromEntries(WIZARD_KEYS.map((key) => [key, t(`post.wizard.${key}`)])),
          detailFields: Object.fromEntries(
            DETAIL_FIELD_KEYS.map((key) => [key, t(`post.detailFields.${key}`)]),
          ),
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
