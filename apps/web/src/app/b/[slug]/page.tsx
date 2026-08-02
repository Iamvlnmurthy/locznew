import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { ListingSummary } from '@locz/shared-types';
import { Icon } from '@/components/icons';
import { ListingCard } from '@/components/listing-card';
import { getMessageGroup, getTranslator } from '@/i18n';
import { ApiError, SITE_URL, api, apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { BusinessEnquiry } from './business-enquiry';
import { ShareBusiness } from './share-business';

interface BusinessHour {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

interface BusinessDetail {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string;
  logoUrl: string | null;
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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const loadBusiness = cache(async (slug: string): Promise<BusinessDetail | null> => {
  try {
    return await api<BusinessDetail>(`/businesses/${encodeURIComponent(slug)}`, { auth: true });
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
  const business = await loadBusiness(slug).catch(() => null);

  if (!business) {
    return { title: 'Business not found', robots: { index: false, follow: false } };
  }

  const title = `${business.name} — ${business.categoryName} in ${business.cityName}`;
  const description =
    business.description?.replace(/\s+/g, ' ').slice(0, 155) ??
    `${business.name} is a ${business.categoryName.toLowerCase()} in ${business.cityName}. Find contact details, offers and jobs on LocZ.`;

  return {
    title,
    description,
    alternates: { canonical: `/b/${business.slug}` },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${SITE_URL}/b/${business.slug}`,
      ...(business.logoUrl ? { images: [{ url: business.logoUrl }] } : {}),
    },
  };
}

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [locale, business, user] = await Promise.all([
    getLocale(),
    loadBusiness(slug),
    getCurrentUser(),
  ]);

  if (!business) notFound();
  const t = getTranslator(locale);
  const p = getMessageGroup(locale, 'businessProfile');
  const localizedDays = [
    p.sunday,
    p.monday,
    p.tuesday,
    p.wednesday,
    p.thursday,
    p.friday,
    p.saturday,
  ];
  const listings = await apiSafe<{ items: ListingSummary[] }>(
    `/search?businessId=${business.id}&limit=12`,
    { revalidate: 300 },
  );
  const openState = currentOpenState(business.hours, p);
  const mapUrl =
    business.latitude !== null && business.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${business.latitude},${business.longitude}`
      : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business.name,
    image: business.logoUrl ?? undefined,
    description: business.description ?? undefined,
    url: `${SITE_URL}/b/${business.slug}`,
    telephone: business.primaryPhone ?? undefined,
    email: business.email ?? undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.addressLine ?? undefined,
      addressLocality: business.cityName,
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

  return (
    <div className="business-profile">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <section className="business-profile-hero">
        <div className="container">
          <nav className="business-profile-breadcrumbs" aria-label={p.breadcrumb}>
            <Link href="/">{t('nav.home')}</Link>
            <Icon name="arrow" />
            <Link href={`/search?q=${encodeURIComponent(business.categoryName)}`}>
              {business.categoryName}
            </Link>
            <Icon name="arrow" />
            <span>{business.cityName}</span>
          </nav>

          <div className="business-profile-cover">
            <span className="business-profile-cover__shape" aria-hidden="true">
              <Icon name="store" />
            </span>
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
            <span className="business-profile-logo">
              {business.logoUrl ? (
                <Image src={business.logoUrl} alt="" width={112} height={112} />
              ) : (
                business.name.slice(0, 1).toUpperCase()
              )}
            </span>
            <div>
              <span className="business-profile-category">{business.categoryName}</span>
              <h1>{business.name}</h1>
              <p>
                <Icon name="location" /> {business.addressLine ? `${business.addressLine}, ` : ''}
                {business.cityName}
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
              </div>
            </div>
            <div className="business-profile-stats">
              <span>
                <strong>{business.listingCount}</strong>
                {p.listings}
              </span>
              <span>
                <strong>{business.viewCount.toLocaleString('en-IN')}</strong>
                {p.profileViews}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="container business-profile-layout">
        <main>
          <nav className="business-profile-tabs" aria-label={p.profileSections}>
            <a href="#about">{p.about}</a>
            <a href="#listings">{p.listingsOffers}</a>
            <a href="#hours">{p.hoursLocation}</a>
          </nav>

          <section className="business-profile-section" id="about">
            <span className="section-kicker">{p.meetBusiness}</span>
            <h2>{p.aboutBusiness.replace('{name}', business.name)}</h2>
            {business.description ? (
              <>
                <p className="business-profile-about">{business.description}</p>
                {/* A reader cannot judge a description without knowing who wrote it, and this
                    one was assembled from the record rather than written by the shop. */}
                {business.descriptionIsGenerated ? (
                  <p className="business-profile-note">{p.descriptionGenerated}</p>
                ) : null}
              </>
            ) : (
              <p className="business-profile-about is-empty">{p.noStory}</p>
            )}

            {business.keywords.length > 0 ? (
              <p className="business-profile-keywords">
                {p.peopleLookFor} {business.keywords.slice(0, 8).join(', ')}
              </p>
            ) : null}

            {/* Nobody has stood behind this record yet, and a buyer deciding whether to trust
                the details deserves to know that before they act on them. */}
            {business.claimStatus === 'UNCLAIMED' && !business.isOwner ? (
              <p className="business-profile-unclaimed">
                {p.unclaimed} <a href="/business/new">{p.claimAction}</a>
              </p>
            ) : null}
            <div className="business-profile-promises">
              <div>
                <Icon name="location" />
                <span>
                  <strong>{p.basedIn.replace('{city}', business.cityName)}</strong>
                  {p.servingNearby}
                </span>
              </div>
              <div>
                <Icon name="message" />
                <span>
                  <strong>{p.easyReach}</strong>
                  {p.enquireSafely}
                </span>
              </div>
              <div>
                <Icon name="shield" />
                <span>
                  <strong>{p.communityStandards}</strong>
                  {p.reportWrong}
                </span>
              </div>
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
                <span>
                  <Icon name="store" />
                </span>
                <div>
                  <strong>{p.nothingPublished}</strong>
                  <p>{p.nothingPublishedBody}</p>
                </div>
              </div>
            )}
          </section>

          <section className="business-profile-section business-profile-hours" id="hours">
            <div>
              <span className="section-kicker">{p.planVisit}</span>
              <h2>{p.hoursLocation}</h2>
              <p>
                <Icon name="location" /> {business.addressLine ?? business.cityName}
              </p>
              {mapUrl ? (
                <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                  {p.getDirections} <Icon name="arrow" />
                </a>
              ) : null}
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

        <aside className="business-profile-contact">
          <section>
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
