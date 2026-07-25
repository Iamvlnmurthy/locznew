import Link from 'next/link';
import type { SearchIndexStatus } from '@locz/shared-types';
import { api } from '@/lib/api';

interface AdminMetrics {
  totalUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  activeUsersThisMonth: number;
  suspendedUsers: number;
  publishedListings: number;
  pendingListings: number;
  rejectedListings: number;
  expiredListings: number;
  listingsToday: number;
  openReports: number;
  totalBusinesses: number;
  verifiedBusinesses: number;
  openJobs: number;
  liveOffers: number;
}

interface Bucket {
  id: string;
  label: string;
  count: number;
}

interface QueueHealth {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  available: boolean;
}

function Metric({
  label,
  value,
  hint,
  attention,
}: {
  label: string;
  value: number | string;
  hint?: string;
  attention?: boolean;
}) {
  return (
    <div className={`card metric${attention ? ' metric--attention' : ''}`}>
      <p className="metric__label">{label}</p>
      <p className="metric__value">
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </p>
      {hint ? <p className="metric__hint">{hint}</p> : null}
    </div>
  );
}

/**
 * Overview. Everything loads concurrently and each panel degrades on its own — if
 * Meilisearch is down the queue and metrics panels must still render, because that is
 * exactly the moment someone is looking at this page.
 */
export default async function OverviewPage() {
  const [metrics, byCity, byCategory, queues, indexStatus] = await Promise.all([
    api<AdminMetrics>('/admin/metrics').catch(() => null),
    api<Bucket[]>('/admin/metrics/listings-by-city?limit=8').catch(() => []),
    api<Bucket[]>('/admin/metrics/listings-by-category?limit=8').catch(() => []),
    api<QueueHealth[]>('/admin/queues').catch(() => []),
    api<SearchIndexStatus>('/search/index/status').catch(() => null),
  ]);

  if (!metrics) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1>Overview</h1>
          </div>
        </div>
        <div className="alert alert--error" role="alert">
          Could not load metrics. Check that the API is running and that this account has the
          <code> metrics:read </code> permission.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <p>Platform health at a glance</p>
        </div>
        {metrics.pendingListings > 0 ? (
          <Link href="/moderation" className="btn btn--primary">
            Review {metrics.pendingListings} pending listing
            {metrics.pendingListings === 1 ? '' : 's'}
          </Link>
        ) : null}
      </div>

      <section className="metric-grid" aria-label="Key metrics">
        <Metric
          label="Pending review"
          value={metrics.pendingListings}
          hint="Waiting for a moderator"
          attention={metrics.pendingListings > 0}
        />
        <Link href="/reports" style={{ textDecoration: 'none' }}>
          <Metric
            label="Open reports"
            value={metrics.openReports}
            hint="User-reported content"
            attention={metrics.openReports > 0}
          />
        </Link>
        <Metric label="Published listings" value={metrics.publishedListings} />
        <Metric label="Posted today" value={metrics.listingsToday} hint="Last 24 hours" />
        <Metric
          label="Total users"
          value={metrics.totalUsers}
          hint={`${metrics.newUsersToday} joined today`}
        />
        <Metric
          label="Active users"
          value={metrics.activeUsersThisMonth}
          hint="Seen in the last 30 days"
        />
        <Metric
          label="Businesses"
          value={metrics.totalBusinesses}
          hint={`${metrics.verifiedBusinesses} verified`}
        />
        <Metric label="Open jobs" value={metrics.openJobs} />
        <Metric label="Live offers" value={metrics.liveOffers} hint="Valid right now" />
        <Metric label="Rejected" value={metrics.rejectedListings} />
        <Metric label="Expired" value={metrics.expiredListings} />
        <Metric
          label="Suspended users"
          value={metrics.suspendedUsers}
          attention={metrics.suspendedUsers > 0}
        />
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Listings by city</h2>
          {byCity.length === 0 ? (
            <p className="metric__hint">No published listings yet.</p>
          ) : (
            <BarList buckets={byCity} />
          )}
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Listings by category</h2>
          {byCategory.length === 0 ? (
            <p className="metric__hint">No published listings yet.</p>
          ) : (
            <BarList buckets={byCategory} />
          )}
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Background queues</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Waiting</th>
                  <th>Active</th>
                  <th>Failed</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((queue) => (
                  <tr key={queue.name}>
                    <td>{queue.name}</td>
                    <td>{queue.available ? queue.waiting : '—'}</td>
                    <td>{queue.available ? queue.active : '—'}</td>
                    <td style={{ color: queue.failed > 0 ? 'var(--locz-danger)' : undefined }}>
                      {queue.available ? queue.failed : 'unreachable'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Search index</h2>
          {!indexStatus ? (
            <p className="metric__hint">Status unavailable.</p>
          ) : (
            <>
              <p style={{ margin: '0 0 8px' }}>
                <span
                  className={`badge badge--${indexStatus.available ? 'published' : 'rejected'}`}
                >
                  {indexStatus.available ? 'Online' : 'Unreachable'}
                </span>
              </p>
              <p className="metric__hint" style={{ margin: 0 }}>
                {indexStatus.indexedDocuments ?? 0} indexed of {indexStatus.publishedListings}{' '}
                published
                {indexStatus.drift > 0 ? ` · ${indexStatus.drift} out of step` : ' · in step'}
              </p>
              <p style={{ marginTop: 12 }}>
                <Link href="/system">Rebuild the index →</Link>
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}

/** Proportional bars — a chart library is not worth the bundle for two lists of counts. */
function BarList({ buckets }: { buckets: Bucket[] }) {
  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
      {buckets.map((bucket) => (
        <li key={bucket.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
            <span>{bucket.label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--locz-text-muted)' }}>
              {bucket.count.toLocaleString('en-IN')}
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: 'var(--locz-surface-muted)',
              borderRadius: 999,
              overflow: 'hidden',
              marginTop: 4,
            }}
          >
            <div
              style={{
                width: `${Math.round((bucket.count / max) * 100)}%`,
                height: '100%',
                background: 'var(--locz-primary)',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export const dynamic = 'force-dynamic';
