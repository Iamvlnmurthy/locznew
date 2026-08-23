import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import type { ListingSummary } from '@locz/shared-types';
import { publicBrandLogo } from '@locz/public-brands';
import { Icon } from '@/components/icons';
import { ListingCard } from '@/components/listing-card';
import { getMessageGroup, getTranslator } from '@/i18n';
import { ApiError, SITE_URL, api, apiSafe } from '@/lib/api';
import { premiumBusinessBanner } from '@/lib/premium-banner-catalog';
import { getCurrentUser, getLocale, localizedAlternates } from '@/lib/session';
import { premiumCategoryArtwork } from '@/lib/premium-icon-catalog';
import { BusinessEnquiry } from './business-enquiry';
import { ShareBusiness } from './share-business';
import { BusinessBackButton } from './back-button';

interface BusinessHour {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

interface SimilarBusiness {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string;
  pincode: string | null;
  distanceMeters?: number;
  verificationStatus: string;
}

interface BusinessDetail {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  categoryId: string;
  cityName: string;
  cityId: string;
  localityName: string | null;
  landmark: string | null;
  /** Public profiles elsewhere, emitted as schema.org sameAs. Absent on older API builds. */
  socialLinks?: string[] | null;
  /** Short public reference, e.g. "000J-HRCF". Absent on older API builds. */
  loczId?: string | null;
  pincode: string | null;
  logoUrl: string | null;
  publicBrandKey: string | null;
  isClaimable?: boolean;
  description: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  primaryPhone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  website: string | null;
  verificationStatus: string;
  hours: BusinessHour[];
  listingCount: number;
  viewCount: number;
  isOwner: boolean;
  createdAt: string;
  /** True when the API composed the description from the record rather than the owner writing it. */
  descriptionIsGenerated: boolean;
  /** Required under the source licence for an imported record. Null for anything a person made. */
  attribution: string | null;
  claimStatus: string;
  keywords: string[];
}

/**
 * The name of the site a profile URL points at.
 *
 * Shown instead of the raw URL, which for these records is usually a numeric Facebook page
 * id — "facebook.com/109648271486990" tells a reader nothing and looks like a tracking link.
 * Anything unrecognised falls back to its hostname rather than being hidden: the link is
 * still useful, and guessing a friendly name we cannot verify is how a wrong brand ends up
 * on somebody's page.
 */
function socialLabel(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const known: Record<string, string> = {
      'facebook.com': 'Facebook',
      'm.facebook.com': 'Facebook',
      'instagram.com': 'Instagram',
      'twitter.com': 'X',
      'x.com': 'X',
      'linkedin.com': 'LinkedIn',
      'youtube.com': 'YouTube',
      'wa.me': 'WhatsApp',
    };
    return known[host] ?? host;
  } catch {
    // Not a URL we can parse. A link we cannot name is not a link we should render.
    return null;
  }
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The locale is part of the cache key on purpose: the same business rendered at /te and at
// /en is two different documents, and caching one under the other's key would serve Telugu
// readers English (or worse, the reverse) from whichever page was built first.
const loadBusiness = cache(async (slug: string, locale: string): Promise<BusinessDetail | null> => {
  try {
    return await api<BusinessDetail>(
      `/businesses/${encodeURIComponent(slug)}?lang=${encodeURIComponent(locale)}`,
      { auth: true },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const business = await loadBusiness(slug, locale).catch(() => null);

  if (!business) {
    return { title: 'Business not found', robots: { index: false, follow: false } };
  }

  // Neighbourhood before district: "Kirana store in Madhapur, Hyderabad" matches how people
  // actually search, and is far less contested than the district-level phrase alone.
  const place = business.localityName
    ? `${business.localityName}, ${business.cityName}`
    : business.cityName;
  const cat = business.categoryName;
  // Lower-casing is an English habit. Telugu and Devanagari have no case, and forcing it on
  // a name that did not come from English is how a proper noun ends up looking wrong.
  const catLower = locale === 'en' ? cat.toLowerCase() : cat;
  // "{category} in {place}" is English word order. Telugu and Hindi both put the place
  // first, and the existing hub pattern already carries that per language, so the title is
  // built from it rather than from an English frame with the nouns swapped out.
  const placed = getMessageGroup(locale, 'hub')
    .metaTitle.replace('{category}', cat)
    .replace('{city}', place);
  const title = `${business.name} — ${placed}`;
  const description =
    business.description?.replace(/\s+/g, ' ').slice(0, 155) ??
    `${business.name} is a ${catLower} in ${place}. Contact number, address, directions, timings, offers and reviews — find the best ${catLower} near you in ${business.cityName} on LocZ.`;
  const brandLogo = business.logoUrl ?? publicBrandLogo(business.name, business.publicBrandKey);

  // The category+place phrases people actually search — the same shape ("Salons & spas in
  // Ahmedabad") that already ranks, expanded to locality, "near me" and best/top variants.
  const keywords = [
    business.name,
    `${business.name} ${business.cityName}`,
    `${cat} in ${business.cityName}`,
    ...(business.localityName ? [`${cat} in ${business.localityName}`, `${cat} in ${place}`] : []),
    `${catLower} near me`,
    `best ${catLower} in ${business.cityName}`,
    `top ${catLower} in ${business.cityName}`,
    `${catLower} near ${business.localityName ?? business.cityName}`,
    cat,
    business.cityName,
  ];

  return {
    title,
    description,
    keywords,
    alternates: await localizedAlternates(`/b/${business.slug}`),
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${SITE_URL}/b/${business.slug}`,
      ...(brandLogo ? { images: [{ url: new URL(brandLogo, SITE_URL).toString() }] } : {}),
    },
  };
}

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const [business, user] = await Promise.all([loadBusiness(slug, locale), getCurrentUser()]);

  if (!business) notFound();

  // The API also answers to a slug the business used to have, so old links keep working.
  // When that happens the URL asked for is not the canonical one, and serving the page at
  // both addresses would be two URLs for one business — duplicate content, and the ranking
  // split between them. 308 sends the reader and the crawler to the real one instead.
  if (business.slug !== slug) permanentRedirect(`/b/${business.slug}`);

  const t = getTranslator(locale);
  const p = getMessageGroup(locale, 'businessProfile');
  const profileLogo = business.logoUrl ?? publicBrandLogo(business.name, business.publicBrandKey);
  const localizedDays = [
    p.sunday,
    p.monday,
    p.tuesday,
    p.wednesday,
    p.thursday,
    p.friday,
    p.saturday,
  ];
  // "Similar businesses nearby" — the same category around this exact point. Every page gets a
  // different set (it depends on the coordinates), so it is genuinely unique content, and the
  // links weave the directory into a mesh a crawler can follow into the deep pages.
  // lang travels with the request so the cards carry Telugu category names on a Telugu page.
  // It is also part of the ISR cache key, which is the reason it belongs in the query string
  // rather than in a header.
  const similarQuery = new URLSearchParams({
    categoryId: business.categoryId,
    limit: '9',
    lang: locale,
  });
  if (business.latitude !== null && business.longitude !== null) {
    similarQuery.set('latitude', String(business.latitude));
    similarQuery.set('longitude', String(business.longitude));
    similarQuery.set('radiusKm', '10');
  } else if (business.pincode) {
    similarQuery.set('pincode', business.pincode);
  }
  const [listings, similarResponse] = await Promise.all([
    apiSafe<{ items: ListingSummary[] }>(`/search?businessId=${business.id}&limit=12`, {
      revalidate: 300,
    }),
    apiSafe<{ items: SimilarBusiness[] }>(`/businesses/nearby?${similarQuery.toString()}`, {
      revalidate: 900,
    }),
  ]);
  const similar = (similarResponse?.items ?? [])
    .filter((b) => b.slug !== business.slug)
    .slice(0, 8);
  const openState = currentOpenState(business.hours, p);
  const mapUrl =
    business.latitude !== null && business.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${business.latitude},${business.longitude}`
      : null;
  const directionsUrl =
    business.latitude !== null && business.longitude !== null
      ? `https://www.google.com/maps/dir/?api=1&destination=${business.latitude},${business.longitude}`
      : null;

  // The neighbourhood placement, in words — "directions" a crawler and a reader can both use,
  // assembled only from address facts (no invented turn-by-turn, which would need an origin).
  const placeLabel = business.localityName
    ? `${business.localityName}, ${business.cityName}`
    : business.cityName;
  // Real profiles the source recorded, so a reader can check the business somewhere that is
  // not LocZ. nofollow because these are third-party links we did not vet.
  const socialProfiles = (business.socialLinks ?? [])
    .map((url) => ({ url, label: socialLabel(url) }))
    .filter((profile): profile is { url: string; label: string } => profile.label !== null)
    .slice(0, 4);

  // A short FAQ answering the exact questions people type for a specific place — its number, its
  // area, whether it is on WhatsApp. Real answers from real fields; rendered as FAQPage JSON-LD.
  const faqs: Array<{ q: string; a: string }> = [
    business.primaryPhone
      ? {
          q: p.faqPhoneQ.replace('{name}', business.name),
          a: p.faqPhoneA
            .replace('{name}', business.name)
            .replace('{phone}', formatPhone(business.primaryPhone)),
        }
      : null,
    {
      q: p.faqWhereQ.replace('{name}', business.name),
      a: p.faqWhereA.replace('{name}', business.name).replace('{place}', placeLabel),
    },
    business.hours.length
      ? { q: p.faqHoursQ.replace('{name}', business.name), a: openState.label }
      : null,
    business.whatsappNumber
      ? {
          q: p.faqWhatsappQ.replace('{name}', business.name),
          a: p.faqWhatsappA.replace('{name}', business.name),
        }
      : null,
  ].filter((item): item is { q: string; a: string } => item !== null);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business.name,
    image: profileLogo ? new URL(profileLogo, SITE_URL).toString() : undefined,
    description: business.description ?? undefined,
    url: `${SITE_URL}/b/${business.slug}`,
    telephone: business.primaryPhone ?? undefined,
    email: business.email ?? undefined,
    // sameAs is how a search engine decides this page and a Facebook profile are the same
    // business rather than two unrelated things with the same name. For an unclaimed record
    // it is the only corroboration the page carries that comes from outside LocZ.
    sameAs: business.socialLinks?.length ? business.socialLinks : undefined,
    identifier: business.loczId ?? undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.addressLine ?? undefined,
      addressLocality: business.localityName ?? business.cityName,
      addressRegion: business.cityName,
      postalCode: business.pincode ?? undefined,
      addressCountry: 'IN',
    },
    ...(business.latitude && business.longitude
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

  // Breadcrumb trail (Home › category › city › business) — mirrors the visible nav and earns
  // breadcrumb rich results / sitelinks in search.
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'LocZ', item: SITE_URL },
      {
        '@type': 'ListItem',
        position: 2,
        name: business.categoryName,
        item: `${SITE_URL}/search?q=${encodeURIComponent(business.categoryName)}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: business.cityName,
        item: `${SITE_URL}/search?cityId=${encodeURIComponent(business.cityId)}`,
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
  const categoryBanner = premiumBusinessBanner(business.name, business.categoryName);
  const displayCategory = storefrontCategoryLabel(business.name, business.categoryName);
  const categoryArtwork = premiumCategoryArtwork({
    name: storefrontArtworkCategory(business.name, business.categoryName),
  });
  const storefrontDescription =
    business.descriptionIsGenerated && displayCategory !== business.categoryName
      ? business.description?.replace(business.categoryName, displayCategory)
      : business.description;

  return (
    <div className="business-profile">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }}
      />
      {faqLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }}
        />
      ) : null}
      {similarLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(similarLd).replace(/</g, '\\u003c') }}
        />
      ) : null}

      <section className="business-profile-hero">
        <div className="container">
          <BusinessBackButton label={p.back} />
          <nav className="business-profile-breadcrumbs" aria-label={p.breadcrumb}>
            <Link href="/">{t('nav.home')}</Link>
            <Icon name="arrow" />
            <Link href={`/search?q=${encodeURIComponent(business.categoryName)}`}>
              {business.categoryName}
            </Link>
            <Icon name="arrow" />
            <span>{business.cityName}</span>
          </nav>

          <div className={`business-profile-cover${categoryBanner ? ' has-banner' : ''}`}>
            {categoryBanner ? (
              <picture>
                <source media="(max-width: 700px)" srcSet={categoryBanner.mobile} />
                <Image
                  src={categoryBanner.desktop}
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 760px) 100vw, 1440px"
                  className="business-profile-cover__banner"
                />
              </picture>
            ) : (
              <span className="business-profile-cover__shape" aria-hidden="true">
                <Image src={categoryArtwork} alt="" width={148} height={148} />
              </span>
            )}
            <div className="business-profile-cover__copy">
              <span>{business.categoryName}</span>
              <strong>{business.cityName}</strong>
            </div>
            <div className="business-profile-cover__actions">
              <ShareBusiness name={business.name} labels={p} />
              {business.isOwner ? (
                <Link href="/dashboard">
                  <Icon name="user" /> {p.manageProfile}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="business-profile-identity">
            <span
              className={`business-profile-logo ${
                profileLogo ? 'business-profile-logo--image' : 'business-profile-logo--monogram'
              }`}
            >
              {profileLogo ? (
                <Image src={profileLogo} alt={`${business.name} logo`} width={112} height={112} />
              ) : (
                <span aria-hidden="true">{business.name.slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            <div className="business-profile-identity__content">
              <span className="business-profile-category">
                {displayCategory}
                {business.localityName ? ` · ${business.localityName}` : ''}
              </span>
              <h1>{business.name}</h1>
              <p>
                <Icon name="location" /> {business.addressLine ? `${business.addressLine}, ` : ''}
                {placeLabel}
                {business.pincode ? ` — ${business.pincode}` : ''}
              </p>
              <div className="business-profile-badges">
                {business.verificationStatus === 'VERIFIED' ? (
                  <span className="is-verified">
                    <Icon name="shield" /> {p.verifiedBusiness}
                  </span>
                ) : (
                  <span>
                    <Icon name="store" /> {p.localBusiness}
                  </span>
                )}
                <span className={openState.isOpen ? 'is-open' : ''}>
                  <i /> {openState.label}
                </span>
                <span>
                  {p.onLoczSince} {new Date(business.createdAt).getFullYear()}
                </span>
                {business.loczId ? (
                  // The same characters already sitting at the end of the URL, labelled. A
                  // shopkeeper ringing up to claim their listing can read this out, and
                  // support can find the record from it.
                  <span className="business-profile-identity__id">
                    {p.loczId} <code>{business.loczId}</code>
                  </span>
                ) : null}
              </div>
              <div className="business-profile-identity__actions" aria-label={p.talkBusiness}>
                {directionsUrl ? (
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="is-primary"
                  >
                    <Icon name="location" /> {p.getDirections}
                  </a>
                ) : null}
                {business.primaryPhone ? (
                  <a href={`tel:${business.primaryPhone}`}>
                    <Icon name="phone" /> {p.callBusiness}
                  </a>
                ) : null}
                {!business.isOwner ? (
                  <a href="#contact">
                    <Icon name="message" /> {p.sendEnquiry}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container business-profile-layout">
        <main>
          <nav className="business-profile-tabs" aria-label={p.profileSections}>
            <a href="#about">
              <Icon name="user" /> {p.about}
            </a>
            <a href="#listings">
              <Icon name="store" /> {p.listingsOffers}
            </a>
            <a href="#hours">
              <Icon name="calendar" /> {p.hoursLocation}
            </a>
            {similar.length > 0 ? (
              <a href="#nearby">
                <Icon name="location" /> {p.nearbyTab}
              </a>
            ) : null}
          </nav>

          <section className="business-profile-section business-profile-section--about" id="about">
            <span className="section-kicker">{p.meetBusiness}</span>
            <h2>{p.aboutBusiness.replace('{name}', business.name)}</h2>
            <div className="business-profile-about-grid">
              <div>
                {storefrontDescription ? (
                  // The "written from public listing data" note used to sit here, under every
                  // one of three and a half million descriptions. It is gone because the page
                  // already says it, better and once: the unclaimed panel below states that
                  // nobody has confirmed these details, and the licence attribution at the
                  // foot names the source. Saying it a third time under every paragraph read
                  // as a disclaimer on the shop itself.
                  <p className="business-profile-about">{storefrontDescription}</p>
                ) : (
                  <p className="business-profile-about is-empty">{p.noStory}</p>
                )}

                {business.keywords.length > 0 ? (
                  <p className="business-profile-keywords">
                    {p.peopleLookFor} {business.keywords.slice(0, 8).join(', ')}
                  </p>
                ) : null}
              </div>
              <aside className="business-profile-about__place">
                {/* This panel used to say "It is in Kokapet, Hyderabad." and then, two boxes
                    later, "Based in Kokapet, Hyderabad" — both repeating the first sentence
                    of the description directly above them. Three statements of one fact read
                    as less information, not more. What is here now is what the page does not
                    already say somewhere else. */}
                {business.landmark ? (
                  <p className="business-profile-where">
                    <Icon name="location" />{' '}
                    {p.nearLandmarkFact.replace('{landmark}', business.landmark)}
                  </p>
                ) : null}
                {socialProfiles.length > 0 ? (
                  <p className="business-profile-social">
                    {p.socialProfiles}{' '}
                    {socialProfiles.map((profile, index) => (
                      <span key={profile.url}>
                        {index > 0 ? ', ' : ''}
                        <a href={profile.url} target="_blank" rel="nofollow noopener noreferrer">
                          {profile.label}
                        </a>
                      </span>
                    ))}
                  </p>
                ) : null}
                {business.claimStatus === 'UNCLAIMED' &&
                business.isClaimable !== false &&
                !business.isOwner ? (
                  <p className="business-profile-unclaimed">
                    {p.unclaimed} <Link href={`/b/${business.slug}/claim`}>{p.claimAction}</Link>
                  </p>
                ) : null}
              </aside>
            </div>
          </section>

          <section className="business-profile-section" id="listings">
            <div className="business-profile-section__head">
              <div>
                <span className="section-kicker">{p.exploreAvailable}</span>
                <h2>{p.listingsHeading}</h2>
              </div>
              {listings?.items.length ? (
                <Link href={`/search?businessId=${business.id}`}>
                  {p.seeAll} <Icon name="arrow" />
                </Link>
              ) : null}
            </div>
            {listings && listings.items.length > 0 ? (
              <div className="card-grid business-profile-listings">
                {listings.items.slice(0, 6).map((listing) => (
                  <ListingCard key={listing.id} listing={listing} t={t} />
                ))}
              </div>
            ) : (
              <div className="business-profile-empty">
                <span className="business-profile-empty__art">
                  <Image src={categoryArtwork} alt="" width={92} height={92} />
                </span>
                <div>
                  <strong>{p.nothingPublished}</strong>
                  <p>{p.nothingPublishedBody}</p>
                </div>
                {business.claimStatus === 'UNCLAIMED' &&
                business.isClaimable !== false &&
                !business.isOwner ? (
                  <Link href={`/b/${business.slug}/claim`}>
                    {p.claimAction} <Icon name="arrow" />
                  </Link>
                ) : null}
              </div>
            )}
          </section>

          <section className="business-profile-section business-profile-hours" id="hours">
            <div>
              <span className="section-kicker">{p.planVisit}</span>
              <h2>{p.hoursLocation}</h2>
              <p>
                <Icon name="location" />{' '}
                {[business.addressLine, business.localityName, business.cityName, business.pincode]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              <div className="business-profile-map-actions">
                {directionsUrl ? (
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--primary btn--sm"
                  >
                    <Icon name="location" /> {p.getDirections}
                  </a>
                ) : null}
                {mapUrl ? (
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--ghost btn--sm"
                  >
                    {p.viewOnMaps} <Icon name="arrow" />
                  </a>
                ) : null}
              </div>
            </div>
            {business.hours.length ? (
              <dl>
                {localizedDays.map((day, dayIndex) => {
                  const slots = business.hours.filter((hour) => hour.dayOfWeek === dayIndex);
                  if (!slots.length) return null;
                  return (
                    <div key={day} className={dayIndex === currentIndiaDay() ? 'is-today' : ''}>
                      <dt>
                        {day}
                        <span>{dayIndex === currentIndiaDay() ? p.today : ''}</span>
                      </dt>
                      <dd>{slots.map((hour) => formatHour(hour, p)).join(', ')}</dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <div className="business-profile-hours__empty">
                <Icon name="calendar" />
                <span>
                  <strong>{p.hoursMissing}</strong>
                  {p.hoursMissingBody}
                </span>
              </div>
            )}
          </section>

          {faqs.length > 0 ? (
            <section className="business-profile-section business-profile-faq" id="faq">
              <span className="section-kicker">{p.goodToKnow}</span>
              <h2>{p.faqHeading.replace('{name}', business.name)}</h2>
              <dl className="business-profile-faq__list">
                {faqs.map((item) => (
                  <div key={item.q}>
                    <dt>{item.q}</dt>
                    <dd>{item.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {similar.length > 0 ? (
            <section className="business-profile-section business-profile-similar" id="nearby">
              <div className="business-profile-section__head">
                <div>
                  <span className="section-kicker">{p.exploreArea}</span>
                  <h2>
                    {p.similarHeading
                      .replace('{category}', business.categoryName)
                      .replace('{place}', placeLabel)}
                  </h2>
                </div>
              </div>
              <ul className="business-profile-similar__grid">
                {similar.map((b) => (
                  <li key={b.id}>
                    <Link href={`/b/${b.slug}`}>
                      <span className="business-profile-similar__logo" aria-hidden="true">
                        {b.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="business-profile-similar__body">
                        <strong>{b.name}</strong>
                        <small>
                          {b.verificationStatus === 'VERIFIED' ? (
                            <>
                              <Icon name="shield" /> {p.verifiedBusiness} ·{' '}
                            </>
                          ) : null}
                          {[b.categoryName, b.pincode].filter(Boolean).join(' · ')}
                          {typeof b.distanceMeters === 'number'
                            ? ` · ${formatDistance(b.distanceMeters, t)}`
                            : ''}
                        </small>
                      </span>
                      <Icon name="arrow" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="business-profile-safety">
            <Icon name="shield" />
            <div>
              <strong>{p.safetyTitle}</strong>
              <p>{p.safetyBody}</p>
            </div>
            <Link href="/safety">
              {p.safetyTips} <Icon name="arrow" />
            </Link>
          </section>
          {/* Not presentation polish. ODbL and CDLA both require attribution to travel with
            the data, so a page rendering an imported record without this is using that
            record outside its licence. */}
          {business.attribution ? (
            <p className="business-profile-attribution">{business.attribution}</p>
          ) : null}
        </main>

        <aside className="business-profile-contact" id="contact">
          <section>
            <div className="business-profile-contact__brand">
              <span aria-hidden="true">
                <Image src={categoryArtwork} alt="" width={64} height={64} />
              </span>
              <div>
                <strong>{business.name}</strong>
                <small>{placeLabel}</small>
              </div>
            </div>
            <span className="section-kicker">{p.talkBusiness}</span>
            <h2>{p.howHelp}</h2>
            <p>{p.contactPrivate}</p>
            {business.isOwner ? (
              <Link href="/dashboard" className="btn btn--primary btn--block">
                <Icon name="user" /> {p.manageBusiness}
              </Link>
            ) : (
              <BusinessEnquiry
                businessId={business.id}
                businessName={business.name}
                businessSlug={business.slug}
                isSignedIn={Boolean(user)}
                labels={p}
              />
            )}

            <div className="business-profile-contact__direct">
              {business.primaryPhone ? (
                <a href={`tel:${business.primaryPhone}`}>
                  <Icon name="phone" />
                  <span>
                    <small>{p.callBusiness}</small>
                    <strong>{formatPhone(business.primaryPhone)}</strong>
                  </span>
                </a>
              ) : null}
              {business.whatsappNumber ? (
                <a
                  href={`https://wa.me/${business.whatsappNumber.replace('+', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="message" />
                  <span>
                    <small>{p.chatOn}</small>
                    <strong>WhatsApp</strong>
                  </span>
                </a>
              ) : null}
              {business.website ? (
                <a href={business.website} target="_blank" rel="noopener noreferrer nofollow">
                  <Icon name="store" />
                  <span>
                    <small>{p.visit}</small>
                    <strong>{p.website}</strong>
                  </span>
                </a>
              ) : null}
              {business.email ? (
                <a href={`mailto:${business.email}`}>
                  <Icon name="message" />
                  <span>
                    <small>{p.sendAn}</small>
                    <strong>{p.email}</strong>
                  </span>
                </a>
              ) : null}
            </div>
          </section>

          <div className="business-profile-contact__trust">
            <span>
              <Icon name="shield" />
            </span>
            <div>
              <strong>{p.saferContact}</strong>
              <p>{p.saferContactBody}</p>
            </div>
          </div>

          {!business.isOwner ? (
            <Link href={`/report?business=${business.id}`} className="business-profile-report">
              {p.reportBusiness}
            </Link>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function currentIndiaDay(): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(new Date());
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
}

function storefrontCategoryLabel(name: string, categoryName: string): string {
  if (categoryName.trim().toLowerCase() !== 'other local businesses') return categoryName;
  if (
    /\b(badminton|cricket|football|tennis|volleyball|basketball|skating|swimming|kabaddi|athletics?|sports?|turf|stadium|arena)\b/i.test(
      name,
    )
  ) {
    return 'Sports & fitness';
  }
  if (/\b(gym|fitness|yoga|crossfit|zumba|aerobics|workout)\b/i.test(name)) {
    return 'Fitness & wellness';
  }
  if (/\b(coaching|tuition|institute|classes|academy|iit|neet|upsc)\b/i.test(name)) {
    return 'Education & training';
  }
  return categoryName;
}

function storefrontArtworkCategory(name: string, categoryName: string): string {
  const label = storefrontCategoryLabel(name, categoryName);
  if (label === 'Sports & fitness') return 'Sports, fitness & outdoors';
  if (label === 'Fitness & wellness') return 'Fitness & gym equipment';
  if (label === 'Education & training') return 'Education & training';
  return categoryName;
}

function currentOpenState(
  hours: BusinessHour[],
  labels: Record<string, string>,
): { isOpen: boolean; label: string } {
  if (!hours.length) return { isOpen: false, label: labels.hoursNotListed };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  const todayHours = hours.filter((hour) => hour.dayOfWeek === currentIndiaDay());
  const openSlot = todayHours.find(
    (hour) => !hour.isClosed && parts >= hour.opensAt && parts <= hour.closesAt,
  );
  if (openSlot)
    return {
      isOpen: true,
      label: labels.openUntil.replace('{time}', formatClock(openSlot.closesAt)),
    };
  const next = todayHours.find((hour) => !hour.isClosed && parts < hour.opensAt);
  return {
    isOpen: false,
    label: next ? labels.opensAt.replace('{time}', formatClock(next.opensAt)) : labels.closedToday,
  };
}

function formatHour(hour: BusinessHour, labels: Record<string, string>): string {
  return hour.isClosed
    ? labels.closed
    : `${formatClock(hour.opensAt)} – ${formatClock(hour.closesAt)}`;
}

function formatClock(value: string): string {
  const [hour, minute] = value.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(-10);
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

function formatDistance(meters: number, t: (key: string) => string): string {
  return meters < 1000
    ? `${Math.round(meters)} ${t('common.m')}`
    : `${(meters / 1000).toFixed(1)} ${t('common.km')}`;
}
