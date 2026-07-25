import Link from 'next/link';
import type { Category, ListingSummary } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { Icon, categoryImageName } from '@/components/icons';
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
    <>
      <section className="home-hero">
        <div className="container home-hero__inner">
          <div className="home-hero__copy">
            <span className="eyebrow">
              <i /> {t('home.eyebrow')}
            </span>
            <h1>{t('home.title')}</h1>
            <p>{t('home.subtitle')}</p>

            <form className="hero-search" action="/search" method="get" role="search">
              <Icon name="search" width="21" height="21" />
              <label htmlFor="hero-search" className="sr-only">
                {t('search.submit')}
              </label>
              <input
                id="hero-search"
                name="q"
                type="search"
                placeholder={t('search.placeholder')}
                autoComplete="off"
              />
              <button type="submit">
                {t('search.submit')} <Icon name="arrow" width="17" height="17" />
              </button>
            </form>

            <div className="hero-trust" aria-label={t('home.trustLabel')}>
              <span>
                <Icon name="shield" /> {t('home.trustSafe')}
              </span>
              <span>
                <Icon name="plus" /> {t('home.trustFree')}
              </span>
              <span>
                <Icon name="location" /> {t('home.trustLocal')}
              </span>
            </div>
          </div>

          <div className="home-hero__scene" aria-hidden="true">
            <picture>
              <source
                media="(max-width: 900px)"
                srcSet="/illustrations/hero-neighbourhood-mobile.webp"
              />
              <img
                src="/illustrations/hero-neighbourhood.webp"
                alt=""
                width="1800"
                height="900"
                fetchPriority="high"
              />
            </picture>
          </div>
        </div>
      </section>

      <div className="container">
        {topCategories.length > 0 ? (
          <section className="category-section">
            <div className="section__head">
              <div>
                <span className="section-kicker">{t('home.explore')}</span>
                <h2>{t('feed.browseCategories')}</h2>
              </div>
              <Link href="/search" className="section-link">
                {t('feed.seeAll')} <Icon name="arrow" />
              </Link>
            </div>
            <nav className="category-strip" aria-label={t('feed.browseCategories')}>
              {topCategories.map((category, index) => (
                <Link
                  key={category.id}
                  href={`/c/${category.slug}`}
                  className={`category-chip category-chip--${(index % 6) + 1}`}
                >
                  <span className="category-chip__icon" aria-hidden="true">
                    <img
                      src={`/icons/categories/${categoryImageName(category.iconKey)}.webp`}
                      alt=""
                      width="64"
                      height="64"
                      loading="lazy"
                    />
                  </span>
                  <span>{localisedCategoryName(category, locale)}</span>
                  <i aria-hidden="true">→</i>
                </Link>
              ))}
            </nav>
          </section>
        ) : null}

        {!feed || feed.sections.length === 0 ? (
          <div className="empty-state">
            <img
              className="empty-state__art"
              src="/illustrations/empty-neighbourhood.webp"
              alt=""
              width="280"
              height="230"
            />
            <h1 className="page-title">{t('brand.tagline')}</h1>
            <p>{t('feed.empty')}</p>
            <Link href="/post" className="btn btn--primary" style={{ marginTop: 16 }}>
              <Icon name="plus" width="18" height="18" /> {t('nav.post')}
            </Link>
          </div>
        ) : (
          <>
            {/* The slogan is the page's h1: it states what LocZ is for in four words,
              and it is what a search engine shows under the title. */}
            <h1 className="home-hero">
              <span className="home-hero__slogan">{t('brand.tagline')}</span>
              <span className="home-hero__city">{feed.cityName}</span>
            </h1>

            {feed.sections.map((section) => (
              <section key={section.key} className="section">
                <div className="section__head">
                  <div>
                    <span className="section-kicker">{t('home.freshNearby')}</span>
                    <h2>{t(`feed.sections.${section.key}`)}</h2>
                  </div>
                  {section.seeAllHref ? (
                    <Link
                      href={section.seeAllHref}
                      style={{ color: 'var(--locz-primary)', fontWeight: 600 }}
                      className="section-link"
                    >
                      {t('feed.seeAll')} <Icon name="arrow" />
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
    </>
  );
}

function localisedCategoryName(category: Category, locale: string): string {
  if (locale === 'te' && category.nameTe) return category.nameTe;
  if (locale === 'hi' && category.nameHi) return category.nameHi;
  return category.name;
}
