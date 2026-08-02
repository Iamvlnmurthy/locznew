import Link from 'next/link';
import { getMessageGroup, getTranslator, type Locale } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getSelectedCity } from '@/lib/session';
import { LocationChip } from './location-chip';
import { LocaleSwitcher } from './locale-switcher';
import { Icon } from './icons';
import { AccountMenu } from './account-menu';
import { ThemeToggle } from './theme-toggle';
import { RecentSearchInput } from './recent-search-input';

/**
 * Site header. Search and location are the two controls that matter on a location-first
 * classifieds site, so they get the space; everything else collapses.
 */
export async function Header({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);
  const searchLabels = getMessageGroup(locale, 'searchUi');
  const [user, city] = await Promise.all([getCurrentUser(), getSelectedCity()]);
  const unreadNotifications = user
    ? await apiSafe<{ count: number }>('/notifications/unread-count', { auth: true })
    : null;

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

        <ThemeToggle label={t('nav.toggleTheme')} className="theme-toggle--mobile" />

        <form className="searchbar" action="/search" method="get" role="search">
          <label htmlFor="site-search" className="sr-only">
            {t('search.submit')}
          </label>
          <Icon name="search" className="searchbar__icon" width="19" height="19" />
          <RecentSearchInput
            id="site-search"
            placeholder={t('search.placeholder')}
            recentLabel={searchLabels.recentSearches}
            clearLabel={searchLabels.clearRecent}
          />
          <button type="submit">
            <span>{t('search.submit')}</span>
            <Icon name="arrow" width="17" height="17" />
          </button>
        </form>

        <div className="header__actions">
          <ThemeToggle label={t('nav.toggleTheme')} />
          <LocaleSwitcher current={locale} label={t('nav.language')} />

          {user ? (
            <>
              <Link
                href="/notifications"
                className="header__notification"
                aria-label={
                  unreadNotifications?.count
                    ? `${unreadNotifications.count} unread notifications`
                    : 'Notifications'
                }
              >
                <Icon name="bell" />
                {unreadNotifications?.count ? (
                  <strong>
                    {unreadNotifications.count > 9 ? '9+' : unreadNotifications.count}
                  </strong>
                ) : null}
              </Link>
              <AccountMenu
                displayName={user.displayName}
                labels={{
                  account: t('nav.account'),
                  myAds: t('nav.myAds'),
                  messages: t('nav.messages'),
                  saved: t('nav.saved'),
                  businesses: t('nav.businesses'),
                  verifyPhone: t('nav.verifyPhone'),
                  location: t('nav.location'),
                  signOut: t('nav.signOut'),
                  signedInAs: t('nav.signedInAs'),
                }}
              />
            </>
          ) : (
            <Link href="/signin" className="btn btn--ghost">
              {t('nav.signIn')}
            </Link>
          )}

          {/* LocZ is sideloaded rather than on the Play Store, so the download has to be
              findable from the site itself. */}
          <Link href="/get-app" className="btn btn--ghost header__get-app">
            <Icon name="phone" width="17" height="17" /> {t('nav.getApp')}
          </Link>

          <Link href="/post" className="btn btn--primary">
            <Icon name="plus" width="18" height="18" /> {t('nav.post')}
          </Link>
        </div>
      </div>

      <nav className="mobile-dock" aria-label={t('nav.primary')}>
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
        <Link href={user ? '/notifications' : '/signin'}>
          <span className="mobile-dock__notification">
            <Icon name={user ? 'bell' : 'user'} />
            {unreadNotifications?.count ? <strong>{unreadNotifications.count}</strong> : null}
          </span>
          <span>{user ? 'Alerts' : t('nav.signIn')}</span>
        </Link>
      </nav>
    </header>
  );
}
