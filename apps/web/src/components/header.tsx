import Link from 'next/link';
import { getTranslator, type Locale } from '@/i18n';
import { getCurrentUser, getSelectedCity } from '@/lib/session';
import { LocationChip } from './location-chip';
import { LocaleSwitcher } from './locale-switcher';

/**
 * Site header. Search and location are the two controls that matter on a location-first
 * classifieds site, so they get the space; everything else collapses.
 */
export async function Header({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);
  const [user, city] = await Promise.all([getCurrentUser(), getSelectedCity()]);

  return (
    <header className="header">
      <div className="container header__row">
        <Link href="/" className="header__brand" aria-label={t('brand.name')}>
          Loc<span>Z</span>
        </Link>

        <LocationChip cityName={city?.name ?? null} changeLabel={t('location.change')} />

        <form className="searchbar" action="/search" method="get" role="search">
          <label htmlFor="site-search" className="sr-only">
            {t('search.submit')}
          </label>
          <input
            id="site-search"
            name="q"
            type="search"
            placeholder={t('search.placeholder')}
            autoComplete="off"
          />
          <button type="submit">{t('search.submit')}</button>
        </form>

        <div className="header__actions">
          <LocaleSwitcher current={locale} label={t('nav.language')} />

          {user ? (
            <Link href="/dashboard" className="btn btn--ghost">
              {t('nav.myAds')}
            </Link>
          ) : (
            <Link href="/signin" className="btn btn--ghost">
              {t('nav.signIn')}
            </Link>
          )}

          <Link href="/post" className="btn btn--primary">
            + {t('nav.post')}
          </Link>
        </div>
      </div>
    </header>
  );
}
