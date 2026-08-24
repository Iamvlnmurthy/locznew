import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import type { City } from '@locz/shared-types';
import { getMessageGroup, getTranslator, type Locale } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getSelectedCity } from '@/lib/session';
import { LocationChip } from './location-chip';
import { LocaleSwitcher } from './locale-switcher';
import { Icon } from './icons';
import { AccountMenu } from './account-menu';
import { ThemeToggle } from './theme-toggle';

/**
 * Site header. Search and location are the two controls that matter on a location-first
 * classifieds site, so they get the space; everything else collapses.
 */
export async function Header({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);
  const discoveryLabels = getMessageGroup(locale, 'discoveryAreas');
  const [user, city] = await Promise.all([getCurrentUser(), getSelectedCity()]);
  // Cookies written before city tiers were introduced remain valid for a year. Resolve those
  // once through the cached city endpoint so existing visitors receive the guide affordance too.
  const selectedCityRecord =
    city?.slug && city.tier === undefined
      ? await apiSafe<City>(`/locations/cities/${encodeURIComponent(city.slug)}`, {
          revalidate: 86400,
        })
      : null;
  const unreadNotifications = user
    ? await apiSafe<{ count: number }>('/notifications/unread-count', { auth: true })
    : null;
  const pathname = (await headers()).get('x-pathname') ?? '';
  const primaryLinks = [
    { href: '/discover/local-now', label: discoveryLabels['local-now'] },
    { href: '/business', label: discoveryLabels.businesses },
    { href: '/discover/jobs', label: discoveryLabels.jobs },
    { href: '/discover/services', label: discoveryLabels.services },
  ];
  const activeClass = (active: boolean, extra = '') =>
    [extra, active ? 'is-active' : ''].filter(Boolean).join(' ') || undefined;

  return (
    <>
      <header className="header">
        <div className="container header__row">
          <Link href="/" className="header__brand" aria-label={t('brand.name')}>
            <Image
              src="/brand/locz-logo.webp"
              alt=""
              width={214}
              height={102}
              priority
              className="header__logo"
            />
          </Link>

          {/* Prefer the readable city name; fall back to the pincode only when that is all
            we have. A bare pincode was being squeezed to an unreadable "50…" in the chip. */}
          <LocationChip
            cityName={city?.name || city?.pincode || null}
            citySlug={city?.slug}
            cityTier={city?.tier ?? selectedCityRecord?.tier}
            changeLabel={t('location.change')}
            exploreLabel={city?.name ? t('location.exploreCity', { city: city.name }) : undefined}
          />

          <nav className="header__primary" aria-label={t('nav.primary')}>
            {primaryLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={pathname.startsWith(item.href) ? 'is-active' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <ThemeToggle label={t('nav.toggleTheme')} className="theme-toggle--mobile" />

          {/* No header search box: the home hero owns search, and inner pages reach it via the
              nav / the mobile Search tab. Removed deliberately (kept cramping the navbar). */}

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
                    profile: t('nav.profile'),
                    myAds: t('nav.myAds'),
                    messages: t('nav.messages'),
                    saved: t('nav.saved'),
                    businesses: t('nav.businesses'),
                    directory: t('nav.directory'),
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
      </header>
      <nav className="mobile-dock" aria-label={t('nav.primary')}>
        <Link href="/" className={activeClass(pathname === '/')}>
          <Icon name="home" />
          <span>{t('nav.home')}</span>
        </Link>
        <Link href="/search" className={activeClass(pathname.startsWith('/search'))}>
          <Icon name="search" />
          <span>{t('nav.search')}</span>
        </Link>
        <Link
          href="/post"
          className={activeClass(pathname.startsWith('/post'), 'mobile-dock__post')}
        >
          <span className="mobile-dock__plus">
            <Icon name="plus" />
          </span>
          <span>{t('nav.post')}</span>
        </Link>
        <Link
          href="/dashboard?tab=saved"
          className={activeClass(pathname.startsWith('/dashboard'))}
        >
          <Icon name="heart" />
          <span>{t('nav.saved')}</span>
        </Link>
        <Link
          href={user ? '/notifications' : '/signin'}
          className={activeClass(
            user ? pathname.startsWith('/notifications') : pathname.startsWith('/signin'),
          )}
        >
          <span className="mobile-dock__notification">
            <Icon name={user ? 'bell' : 'user'} />
            {unreadNotifications?.count ? <strong>{unreadNotifications.count}</strong> : null}
          </span>
          <span>{user ? 'Alerts' : t('nav.signIn')}</span>
        </Link>
      </nav>
    </>
  );
}
