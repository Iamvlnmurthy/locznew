import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ListingSummary, Paginated } from '@locz/shared-types';
import { ListingCard } from '@/components/listing-card';
import { getTranslator } from '@/i18n';
import { apiSafe } from '@/lib/api';
import { getCurrentUser, getLocale } from '@/lib/session';
import { ListingActions } from './listing-actions';

export const metadata: Metadata = {
  title: 'My LocZ',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ tab }, locale, user] = await Promise.all([searchParams, getLocale(), getCurrentUser()]);
  if (!user) redirect('/signin?next=%2Fdashboard');

  const t = getTranslator(locale);
  const showSaved = tab === 'saved';

  const [mine, saved] = await Promise.all([
    apiSafe<Paginated<ListingSummary>>('/listings/mine?limit=50', { auth: true }),
    apiSafe<Paginated<ListingSummary>>('/listings/saved?limit=50', { auth: true }),
  ]);

  const items = showSaved ? (saved?.items ?? []) : (mine?.items ?? []);

  return (
    <div className="container">
      <h1 className="page-title">{t('dashboard.title')}</h1>

      <nav style={{ display: 'flex', gap: 8, marginBottom: 24 }} aria-label={t('dashboard.title')}>
        <Link
          href="/dashboard"
          className={`btn ${showSaved ? 'btn--outline' : 'btn--primary'}`}
          aria-current={showSaved ? undefined : 'page'}
        >
          {t('dashboard.myAds')} ({mine?.meta.total ?? 0})
        </Link>
        <Link
          href="/dashboard?tab=saved"
          className={`btn ${showSaved ? 'btn--primary' : 'btn--outline'}`}
          aria-current={showSaved ? 'page' : undefined}
        >
          {t('dashboard.savedAds')} ({saved?.meta.total ?? 0})
        </Link>
      </nav>

      {items.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: '1.125rem', fontWeight: 600 }}>
            {showSaved ? t('dashboard.noSaved') : t('dashboard.noAds')}
          </p>
          <p>{showSaved ? t('dashboard.noSavedHint') : t('dashboard.noAdsHint')}</p>
          {!showSaved ? (
            <Link href="/post" className="btn btn--primary" style={{ marginTop: 16 }}>
              + {t('nav.post')}
            </Link>
          ) : null}
        </div>
      ) : showSaved ? (
        <div className="card-grid">
          {items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} t={t} />
          ))}
        </div>
      ) : (
        // Own listings get a row layout rather than the card grid: status and lifecycle
        // actions matter more here than the photo does.
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
          {items.map((listing) => (
            <li key={listing.id} className="panel" style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {listing.thumbUrl ? (
                  <img
                    src={listing.thumbUrl}
                    alt=""
                    width={72}
                    height={72}
                    style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : null}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href={`/ad/${listing.slug}`}
                    style={{ fontWeight: 600, overflowWrap: 'anywhere' }}
                  >
                    {listing.title}
                  </Link>
                  <p
                    style={{
                      margin: '4px 0 0',
                      color: 'var(--locz-text-muted)',
                      fontSize: '0.875rem',
                    }}
                  >
                    <span className="badge badge--status">
                      {t(`dashboard.status.${listing.status}`)}
                    </span>
                    {' · '}
                    {t('listing.views', { count: listing.viewCount })}
                  </p>
                </div>
              </div>

              <ListingActions
                listingId={listing.id}
                status={listing.status}
                labels={{
                  pause: t('dashboard.action.pause'),
                  resume: t('dashboard.action.resume'),
                  markSold: t('dashboard.action.markSold'),
                  republish: t('dashboard.action.republish'),
                  delete: t('dashboard.action.delete'),
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
