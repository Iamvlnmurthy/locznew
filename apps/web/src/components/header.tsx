import Link from 'next/link';
import { getTranslator, type Locale } from '@/i18n';
import { getCurrentUser, getSelectedCity } from '@/lib/session';
import { LocationChip } from './location-chip';
import { LocaleSwitcher } from './locale-switcher';
import { Icon } from './icons';

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
          <picture>
            <source media="(max-width: 760px)" srcSet="/brand/locz-mark.png" />
            <img
              src="/brand/locz-logo.webp"
              alt=""
              width="214"
              height="102"
              className="header__logo"
            />
          </picture>
        </Link>

        {/* The pincode is what the visitor typed, so it is what the chip shows back. */}
        <LocationChip
          cityName={city?.pincode ?? city?.name ?? null}
          changeLabel={t('location.change')}
        />

        <form className="searchbar" action="/search" method="get" role="search">
          <label htmlFor="site-search" className="sr-only">
            {t('search.submit')}
          </label>
          <Icon name="search" className="searchbar__icon" width="19" height="19" />
          <input
            id="site-search"
            name="q"
            type="search"
            placeholder={t('search.placeholder')}
            autoComplete="off"
          />
          <button type="submit">
            <span>{t('search.submit')}</span>
            <Icon name="arrow" width="17" height="17" />
          </button>
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
            <Icon name="plus" width="18" height="18" /> {t('nav.post')}
          </Link>
        </div>
      </div>

      <nav className="mobile-dock" aria-label="Primary navigation">
        <Link href="/">
          <Icon name="home" />
          <span>{t('nav.home')}</span>
        </Link>
        <Link href="/search">
          <Icon name="search" />
          <span>{t('nav.search')}</span>
        </Link>
        <Link href="/post" className="mobile-dock__post">
          <span className="mobile-dock__plus">
            <Icon name="plus" />
          </span>
          <span>{t('nav.post')}</span>
        </Link>
        <Link href="/dashboard?tab=saved">
          <Icon name="heart" />
          <span>{t('nav.saved')}</span>
        </Link>
        <Link href={user ? '/dashboard' : '/signin'}>
          <Icon name="user" />
          <span>{user ? t('nav.account') : t('nav.signIn')}</span>
        </Link>
      </nav>
    </header>
  );
}
