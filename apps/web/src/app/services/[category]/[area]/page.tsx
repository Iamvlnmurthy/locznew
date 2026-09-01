import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { Category, Paginated } from '@locz/shared-types';
import { publicBrandLogo } from '@locz/public-brands';
import { Icon } from '@/components/icons';
import { getMessageGroup, type Locale } from '@/i18n';
import { ApiError, SITE_URL, api, apiSafe } from '@/lib/api';
import { businessListingArtwork } from '@/lib/business-listing-artwork';
import { localizedName } from '@/lib/localized-name';
import { getLocale, localizedAlternates } from '@/lib/session';
import styles from './page.module.css';

interface ServiceProvider {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string;
  citySlug: string | null;
  localityName: string | null;
  localitySlug: string | null;
  pincode: string | null;
  primaryPhone: string | null;
  addressLine: string | null;
  logoUrl: string | null;
  publicBrandKey: string | null;
  isClaimable: boolean;
  verificationStatus: string;
  claimStatus: string;
  latitude: number | null;
  longitude: number | null;
}

interface BusinessCategory {
  id: string;
  slug: string;
  name: string;
  count: number;
}

interface ServiceAreaData {
  category: Category;
  providers: ServiceProvider[];
  total: number;
  localityName: string;
  cityName: string;
  citySlug: string;
  siblings: BusinessCategory[];
}

export const revalidate = 900;

const loadCategory = cache(async (slug: string): Promise<Category | null> => {
  try {
    return await api<Category>(`/categories/${encodeURIComponent(slug)}`, {
      revalidate: 86400,
      tags: ['categories'],
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});

const loadServiceArea = cache(
  async (
    categorySlug: string,
    areaSlug: string,
    locale: Locale,
  ): Promise<ServiceAreaData | null> => {
    const [category, categories] = await Promise.all([
      loadCategory(categorySlug),
      apiSafe<BusinessCategory[]>('/businesses/categories', { revalidate: 1800 }),
    ]);
    if (!category) return null;

    const query = new URLSearchParams({
      categoryId: category.id,
      localitySlug: areaSlug,
      limit: '30',
      sort: 'recommended',
    });
    if (locale !== 'en') query.set('lang', locale);
    const result = await apiSafe<Paginated<ServiceProvider>>(`/businesses?${query}`, {
      revalidate: 900,
    });
    const candidates = result?.items ?? [];
    if ((result?.meta.total ?? 0) < 5 || candidates.length < 5) return null;

    // Locality slugs are city-scoped in the database while this public URL intentionally stays
    // compact. Keep a page internally coherent if the same slug exists in more than one city by
    // selecting the largest city group in the returned provider set.
    const groups = new Map<string, ServiceProvider[]>();
    for (const provider of candidates) {
      const key = provider.citySlug || provider.cityName;
      groups.set(key, [...(groups.get(key) ?? []), provider]);
    }
    const providers = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
    if (providers.length < 5) return null;
    const first = providers[0];
    const localityName = first.localityName || titleFromSlug(areaSlug);
    const cityName = first.cityName;
    const citySlug = first.citySlug || slugify(cityName);
    const total = groups.size === 1 ? (result?.meta.total ?? providers.length) : providers.length;

    return {
      category,
      providers,
      total,
      localityName,
      cityName,
      citySlug,
      siblings: (categories ?? []).filter((item) => item.slug !== categorySlug).slice(0, 8),
    };
  },
);

function titleFromSlug(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function directionsHref(provider: ServiceProvider): string {
  const destination =
    provider.latitude !== null && provider.longitude !== null
      ? `${provider.latitude},${provider.longitude}`
      : [provider.name, provider.addressLine, provider.cityName].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; area: string }>;
}): Promise<Metadata> {
  const [{ category: categorySlug, area }, locale] = await Promise.all([params, getLocale()]);
  const data = await loadServiceArea(categorySlug, area, locale);
  if (!data) return { title: 'Not found', robots: { index: false, follow: false } };
  const s = getMessageGroup(locale, 'serviceArea');
  const categoryName = localizedName(data.category, locale);
  const title = s.metaTitle
    .replace('{category}', categoryName)
    .replace('{locality}', data.localityName)
    .replace('{city}', data.cityName);
  const description = s.metaDescription
    .replace('{count}', String(data.total))
    .replace('{category}', categoryName)
    .replace('{locality}', data.localityName)
    .replace('{city}', data.cityName);
  const path = `/services/${data.category.slug}/${area}`;
  return {
    title,
    description,
    alternates: await localizedAlternates(path),
    openGraph: { title, description, type: 'website', url: `${SITE_URL}${path}` },
  };
}

export default async function ServiceAreaPage({
  params,
}: {
  params: Promise<{ category: string; area: string }>;
}) {
  const [{ category: categorySlug, area }, locale] = await Promise.all([params, getLocale()]);
  const data = await loadServiceArea(categorySlug, area, locale);
  if (!data) notFound();

  const s = getMessageGroup(locale, 'serviceArea');
  const categoryName = localizedName(data.category, locale);
  const placeName = `${data.localityName}, ${data.cityName}`;
  const heading = s.heading
    .replace('{category}', categoryName)
    .replace('{locality}', data.localityName)
    .replace('{city}', data.cityName);
  const faq = [
    {
      q: s.faqCountQuestion
        .replace('{category}', categoryName)
        .replace('{locality}', data.localityName),
      a: s.faqCountAnswer
        .replace('{count}', String(data.total))
        .replace('{category}', categoryName)
        .replace('{locality}', data.localityName),
    },
    { q: s.faqVerifiedQuestion, a: s.faqVerifiedAnswer },
    { q: s.faqBookQuestion.replace('{category}', categoryName), a: s.faqBookAnswer },
  ];
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: heading,
    numberOfItems: data.providers.length,
    itemListElement: data.providers.map((provider, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'LocalBusiness',
        name: provider.name,
        url: `${SITE_URL}/b/${provider.slug}`,
        ...(provider.primaryPhone ? { telephone: provider.primaryPhone } : {}),
        address: {
          '@type': 'PostalAddress',
          streetAddress: provider.addressLine || undefined,
          addressLocality: data.localityName,
          addressRegion: data.cityName,
          postalCode: provider.pincode || undefined,
          addressCountry: 'IN',
        },
      },
    })),
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  return (
    <main className={styles.page}>
      {[itemListLd, faqLd].map((value, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, '\\u003c') }}
        />
      ))}
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <nav className={styles.breadcrumbs} aria-label={s.breadcrumbLabel}>
          <Link href="/">{s.home}</Link>
          <span>›</span>
          <Link href={`/in/${data.citySlug}`}>{data.cityName}</Link>
          <span>›</span>
          <Link href={`/c/${data.category.slug}`}>{categoryName}</Link>
        </nav>
        <span className={styles.eyebrow}>
          <Icon name="location" /> {s.localServices}
        </span>
        <h1>{heading}</h1>
        <p>
          {s.heroBody
            .replace('{count}', String(data.total))
            .replace('{category}', categoryName)
            .replace('{place}', placeName)}
        </p>
        <div className={styles.heroStats}>
          <strong>{data.total.toLocaleString(`${locale}-IN`)}</strong>
          <span>{s.providersAvailable}</span>
        </div>
      </section>

      <div className={styles.layout}>
        <section className={styles.results} aria-labelledby="provider-heading">
          <div className={styles.sectionHeading}>
            <div>
              <span>{s.nearbyEyebrow}</span>
              <h2 id="provider-heading">
                {s.providersHeading.replace('{locality}', data.localityName)}
              </h2>
            </div>
            <p>{s.updatedLabel}</p>
          </div>
          <div className={styles.grid}>
            {data.providers.map((provider) => {
              const logo =
                provider.logoUrl ?? publicBrandLogo(provider.name, provider.publicBrandKey);
              const artwork = businessListingArtwork(provider.name, provider.categoryName);
              const canClaim = provider.claimStatus === 'UNCLAIMED' && provider.isClaimable;
              return (
                <article className={styles.card} key={provider.id}>
                  <Link
                    className={styles.cardLink}
                    href={`/b/${provider.slug}`}
                    aria-label={provider.name}
                  />
                  <div className={styles.visual} aria-hidden="true">
                    <Image src={logo || artwork.src} alt="" width={76} height={76} />
                  </div>
                  <div className={styles.cardBody}>
                    <span className={styles.category}>{provider.categoryName}</span>
                    <h3>{provider.name}</h3>
                    <p>
                      <Icon name="location" />{' '}
                      {[provider.addressLine, data.localityName, provider.pincode]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                    <div className={styles.badges}>
                      {provider.verificationStatus === 'VERIFIED' ? (
                        <span>
                          <Icon name="shield" /> {s.verified}
                        </span>
                      ) : (
                        <span>{s.localBusiness}</span>
                      )}
                    </div>
                    <div className={styles.actions}>
                      {provider.primaryPhone ? (
                        <a className={styles.primaryAction} href={`tel:${provider.primaryPhone}`}>
                          <Icon name="phone" /> {s.call}
                        </a>
                      ) : (
                        <>
                          <a
                            className={styles.primaryAction}
                            href={directionsHref(provider)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Icon name="navigation" /> {s.directions}
                          </a>
                          {canClaim ? (
                            <Link
                              className={styles.secondaryAction}
                              href={`/b/${provider.slug}/claim`}
                            >
                              {s.claim}
                            </Link>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className={styles.aside}>
          <section className={styles.infoCard}>
            <span>{s.areaGuide}</span>
            <h2>{s.aboutHeading.replace('{locality}', data.localityName)}</h2>
            <p>
              {s.aboutBody
                .replace('{category}', categoryName)
                .replace('{locality}', data.localityName)
                .replace('{city}', data.cityName)}
            </p>
            <Link href={`/in/${data.citySlug}`}>
              {s.exploreCity.replace('{city}', data.cityName)} <Icon name="arrow" />
            </Link>
          </section>
          <section className={styles.tradeCard}>
            <h2>{s.otherServices.replace('{locality}', data.localityName)}</h2>
            <div className={styles.chips}>
              {data.siblings.map((item) => (
                <Link key={item.id} href={`/services/${item.slug}/${area}`}>
                  {item.name}
                </Link>
              ))}
            </div>
            <Link className={styles.allCategories} href={`/c/${data.category.slug}`}>
              {s.browseCategory.replace('{category}', categoryName)} <Icon name="arrow" />
            </Link>
          </section>
        </aside>
      </div>

      <section className={styles.faq}>
        <div className={styles.sectionHeading}>
          <div>
            <span>{s.faqEyebrow}</span>
            <h2>{s.faqHeading.replace('{locality}', data.localityName)}</h2>
          </div>
        </div>
        <div className={styles.faqGrid}>
          {faq.map((item) => (
            <article key={item.q}>
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
