import { SITE_URL } from '@/lib/api';
import { schemaTypeFor } from '@/lib/schema-type';
import { PUBLIC_SERVICE_SCHEMA_TYPES, isPublicServiceSlug } from '@/lib/public-services';
import type { BusinessDetail } from './page';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * All schema.org structured data for a storefront, extracted from the (large) page component so the
 * SEO payload lives in one testable place. Pure data — returns the four JSON-LD graphs the page
 * renders in <script type="application/ld+json"> tags. No JSX, no side effects.
 */
export function buildStorefrontJsonLd(
  business: BusinessDetail,
  opts: {
    profileLogo: string | null;
    faqs: { q: string; a: string }[];
    similar: { slug: string; name: string }[];
  },
) {
  const { profileLogo, faqs, similar } = opts;

  const jsonLdSameAs = [business.website, ...(business.socialLinks ?? [])].filter(
    (url): url is string => Boolean(url),
  );

  const publicSchemaType = isPublicServiceSlug(business.categorySlug)
    ? PUBLIC_SERVICE_SCHEMA_TYPES[business.categorySlug]
    : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type':
      publicSchemaType ??
      (business.railway
        ? 'TrainStation'
        : business.postOffice
          ? 'PostOffice'
          : business.banking
            ? 'BankOrCreditUnion'
            : schemaTypeFor(business.categoryName, business.parentCategoryName)),
    '@id': `${SITE_URL}/b/${business.slug}#entity`,
    name: business.name,
    image: profileLogo ? new URL(profileLogo, SITE_URL).toString() : undefined,
    description: business.description ?? undefined,
    url: `${SITE_URL}/b/${business.slug}`,
    telephone: business.primaryPhone ?? undefined,
    email: business.email ?? undefined,
    sameAs: jsonLdSameAs.length ? jsonLdSameAs : undefined,
    identifier: business.loczId ?? undefined,
    knowsAbout: business.keywords.length ? business.keywords : undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.addressLine ?? undefined,
      addressLocality: business.localityName ?? business.cityName,
      addressRegion: business.stateName ?? undefined,
      postalCode: business.pincode ?? undefined,
      addressCountry: 'IN',
    },
    ...(business.latitude !== null && business.longitude !== null
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: business.latitude,
            longitude: business.longitude,
          },
        }
      : {}),
    openingHoursSpecification: business.hours
      .filter((hour) => !hour.isClosed)
      .map((hour) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${DAYS[hour.dayOfWeek]}`,
        opens: hour.opensAt,
        closes: hour.closesAt,
      })),
  };

  // Breadcrumb trail (Home › city › category › business) — mirrors the visible nav and earns
  // breadcrumb rich results / sitelinks in search.
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'LocZ', item: SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: business.cityName,
        item: `${SITE_URL}/in/${business.citySlug}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: `${business.categoryName} in ${business.cityName}`,
        item: `${SITE_URL}/in/${business.citySlug}/${business.categorySlug}`,
      },
      { '@type': 'ListItem', position: 4, name: business.name },
    ],
  };

  // FAQPage — the answers a person types for this specific place, eligible for FAQ rich results.
  const faqLd = faqs.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      }
    : null;

  // ItemList of the nearby similar businesses — declares the internal links as a curated set.
  const similarLd = similar.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: similar.map((b, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE_URL}/b/${b.slug}`,
          name: b.name,
        })),
      }
    : null;

  return { jsonLd, breadcrumbLd, faqLd, similarLd };
}
