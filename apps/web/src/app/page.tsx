import Link from 'next/link';
import type { Category, ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getLocale, getSelectedCity } from '@/lib/session';

interface FeedSection {
  key: string;
  title: string;
  seeAllHref?: string;
  items: ListingSummary[];
}

interface Feed {
  cityId: string;
  cityName: string;
  sections: FeedSection[];
}

// The feed is personalised for signed-in users and location-dependent for everyone,
// so it is rendered per request rather than cached.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const locale = await getLocale();
  const t = getTranslator(locale);
  const city = await getSelectedCity();

  const query = new URLSearchParams({ limit: '12' });
  if (city?.id) query.set('cityId', city.id);
  if (city?.latitude && city?.longitude) {
    query.set('latitude', String(city.latitude));
    query.set('longitude', String(city.longitude));
  }

  const [feed, categories] = await Promise.all([
    apiSafe<Feed>(`/feed?${query.toString()}`, { auth: true }),
    apiSafe<Category[]>('/categories', { revalidate: 3600 }),
  ]);

  const topCategories = (categories ?? []).slice(0, 12);

  return (
    <div className="container">
      {topCategories.length > 0 ? (
        <nav className="category-strip" aria-label={t('feed.browseCategories')}>
          {topCategories.map((category) => (
            <Link key={category.id} href={`/c/${category.slug}`} className="category-chip">
              <span aria-hidden="true" style={{ fontSize: '1.25rem' }}>
                {categoryEmoji(category.iconKey)}
              </span>
              <span>{localisedCategoryName(category, locale)}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {!feed || feed.sections.length === 0 ? (
        <div className="empty-state">
          <h1 className="page-title">{t('brand.tagline')}</h1>
          <p>{t('feed.empty')}</p>
          <Link href="/post" className="btn btn--primary" style={{ marginTop: 16 }}>
            + {t('nav.post')}
          </Link>
        </div>
      ) : (
        <>
          <h1 className="sr-only">
            {t('brand.name')} — {feed.cityName}
          </h1>

          {feed.sections.map((section) => (
            <section key={section.key} className="section">
              <div className="section__head">
                <h2>{t(`feed.sections.${section.key}`)}</h2>
                {section.seeAllHref ? (
                  <Link
                    href={section.seeAllHref}
                    style={{ color: 'var(--locz-primary)', fontWeight: 600 }}
                  >
                    {t('feed.seeAll')} →
                  </Link>
                ) : null}
              </div>

              {/* Rails keep the home screen scannable on a phone; search uses a grid. */}
              <div className="card-rail">
                {section.items.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} t={t} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function localisedCategoryName(category: Category, locale: string): string {
  if (locale === 'te' && category.nameTe) return category.nameTe;
  if (locale === 'hi' && category.nameHi) return category.nameHi;
  return category.name;
}

/** Icon keys map to emoji for now — an icon font is not worth the payload at launch. */
function categoryEmoji(iconKey: string | null): string {
  const map: Record<string, string> = {
    device: '📱',
    phone: '📱',
    laptop: '💻',
    tv: '📺',
    car: '🚗',
    bike: '🏍️',
    sofa: '🛋️',
    briefcase: '💼',
    code: '👨‍💻',
    chart: '📊',
    truck: '🚚',
    store: '🏪',
    tools: '🔧',
    wrench: '🔧',
    book: '📚',
    heart: '💚',
    home: '🏠',
    tag: '🏷️',
    utensils: '🍽️',
    bed: '🛏️',
    scissors: '✂️',
    bag: '🛍️',
    calendar: '📅',
    stethoscope: '🩺',
  };
  return (iconKey && map[iconKey]) || '📦';
}
