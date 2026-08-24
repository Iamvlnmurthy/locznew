import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { getTranslator } from '@/i18n';
import { CITY_GUIDE_CATALOG } from '@/lib/city-guide-catalog';
import { getLocale, localizedAlternates } from '@/lib/session';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getTranslator(locale);
  return {
    title: t('cityDirectory.metadataTitle'),
    description: t('cityDirectory.metadataDescription'),
    alternates: await localizedAlternates('/cities'),
  };
}

export default async function CitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q = '' }, locale] = await Promise.all([searchParams, getLocale()]);
  const t = getTranslator(locale);
  const query = q.trim().toLocaleLowerCase(locale);
  const visibleCities = query
    ? CITY_GUIDE_CATALOG.filter((city) =>
        `${city.name} ${city.state}`.toLocaleLowerCase(locale).includes(query),
      )
    : CITY_GUIDE_CATALOG;
  const tierOne = CITY_GUIDE_CATALOG.filter((city) => city.tier === 1);
  const grouped = Object.entries(
    visibleCities.reduce<Record<string, (typeof visibleCities)[number][]>>((states, city) => {
      (states[city.state] ??= []).push(city);
      return states;
    }, {}),
  ).sort(([stateA], [stateB]) => stateA.localeCompare(stateB, locale));
  const stateCount = new Set(CITY_GUIDE_CATALOG.map((city) => city.state)).size;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.orbit} aria-hidden="true" />
        <div className={`container ${styles.heroInner}`}>
          <nav className={styles.breadcrumbs} aria-label={t('common.breadcrumb')}>
            <Link href="/">{t('nav.home')}</Link>
            <span>›</span>
            <span>{t('cityDirectory.title')}</span>
          </nav>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <span className={styles.kicker}>{t('cityDirectory.kicker')}</span>
              <h1>{t('cityDirectory.title')}</h1>
              <p>{t('cityDirectory.subtitle')}</p>
              <form action="/cities" className={styles.search} role="search">
                <Icon name="search" />
                <input
                  name="q"
                  type="search"
                  defaultValue={q}
                  placeholder={t('cityDirectory.searchPlaceholder')}
                  aria-label={t('cityDirectory.searchPlaceholder')}
                />
                <button type="submit">
                  {t('search.submit')} <Icon name="arrow" />
                </button>
              </form>
            </div>
            <dl className={styles.metrics}>
              <div>
                <dt>{CITY_GUIDE_CATALOG.length}</dt>
                <dd>{t('cityDirectory.cityGuides')}</dd>
              </div>
              <div>
                <dt>{tierOne.length}</dt>
                <dd>{t('cityDirectory.tierOne')}</dd>
              </div>
              <div>
                <dt>{CITY_GUIDE_CATALOG.length - tierOne.length}</dt>
                <dd>{t('cityDirectory.tierTwo')}</dd>
              </div>
              <div>
                <dt>{stateCount}</dt>
                <dd>{t('cityDirectory.states')}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <div className={`container ${styles.content}`}>
        {!query ? (
          <section className={styles.featured} aria-labelledby="tier-one-cities-title">
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.kicker}>{t('cityDirectory.featuredKicker')}</span>
                <h2 id="tier-one-cities-title">{t('cityDirectory.featuredTitle')}</h2>
              </div>
              <p>{t('cityDirectory.featuredText')}</p>
            </div>
            <div className={styles.featuredGrid}>
              {tierOne.map((city, index) => (
                <Link href={`/in/${city.slug}`} key={city.slug} className={styles.featuredCard}>
                  <span className={styles.index}>{String(index + 1).padStart(2, '0')}</span>
                  <span className={styles.monogram}>{city.name.slice(0, 1)}</span>
                  <span className={styles.cityCopy}>
                    <strong>{city.name}</strong>
                    <small>
                      <Icon name="location" />
                      {city.state}
                    </small>
                  </span>
                  <span className={styles.arrow}>
                    <Icon name="arrow" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.directory} aria-labelledby="all-city-guides-title">
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.kicker}>{t('cityDirectory.directoryKicker')}</span>
              <h2 id="all-city-guides-title">
                {query
                  ? t('cityDirectory.resultsTitle', { query: q })
                  : t('cityDirectory.allTitle')}
              </h2>
            </div>
            <p>{t('cityDirectory.resultCount', { count: visibleCities.length })}</p>
          </div>

          {grouped.length ? (
            <div className={styles.stateList}>
              {grouped.map(([state, cities], stateIndex) => (
                <section
                  key={state}
                  className={styles.stateGroup}
                  aria-labelledby={`state-${stateIndex}`}
                >
                  <header>
                    <span>{String(stateIndex + 1).padStart(2, '0')}</span>
                    <div>
                      <h3 id={`state-${stateIndex}`}>{state}</h3>
                      <small>{t('cityDirectory.citiesInState', { count: cities.length })}</small>
                    </div>
                  </header>
                  <div className={styles.cityGrid}>
                    {cities.map((city) => (
                      <Link href={`/in/${city.slug}`} key={city.slug}>
                        <span className={styles.dot} aria-hidden="true" />
                        <span>
                          <strong>{city.name}</strong>
                          <small>{t('cityDirectory.tierLabel', { tier: city.tier })}</small>
                        </span>
                        <Icon name="arrow" />
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <span>
                <Icon name="search" />
              </span>
              <h2>{t('cityDirectory.noResults', { query: q })}</h2>
              <p>{t('cityDirectory.noResultsText')}</p>
              <Link href="/cities" className="btn btn--primary">
                {t('cityDirectory.clearSearch')}
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
