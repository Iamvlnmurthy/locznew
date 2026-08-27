import Link from 'next/link';
import type { SearchIndexStatus } from '@locz/shared-types';
import { api } from '@/lib/api';
import { ConsoleIcon, type ConsoleIconName } from './console-icon';

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

interface TopListing {
  id: string;
  title: string;
  slug: string;
  cityName: string;
  viewCount: number;
  saveCount: number;
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
  note,
  icon,
  tone = 'green',
}: {
  label: string;
  value: number;
  note: string;
  icon: ConsoleIconName;
  tone?: 'green' | 'amber' | 'coral' | 'blue';
}) {
  return (
    <article className={`metric metric--${tone}`}>
      <div className="metric__top">
        <span className="metric__icon">
          <ConsoleIcon name={icon} size={19} />
        </span>
        <span className="metric__label">{label}</span>
      </div>
      <p className="metric__value">{value.toLocaleString('en-IN')}</p>
      <p className="metric__hint">{note}</p>
    </article>
  );
}

export default async function OverviewPage() {
  const [
    metrics,
    byCity,
    byCategory,
    daily,
    topListings,
    queues,
    indexStatus,
    demand,
    unmetDemand,
  ] = await Promise.all([
    api<AdminMetrics>('/admin/metrics').catch(() => null),
    api<Bucket[]>('/admin/metrics/listings-by-city?limit=5').catch(() => []),
    api<Bucket[]>('/admin/metrics/listings-by-category?limit=5').catch(() => []),
    api<Bucket[]>('/admin/metrics/daily-listings?days=14').catch(() => []),
    api<TopListing[]>('/admin/metrics/most-viewed?limit=5').catch(() => []),
    api<QueueHealth[]>('/admin/queues').catch(() => []),
    api<SearchIndexStatus>('/search/index/status').catch(() => null),
    api<{
      openRequirements: number;
      fulfilledRequirements: number;
      unansweredRequirements: number;
      demandFulfillmentRate: number;
    }>('/admin/metrics/demand').catch(() => null),
    api<Bucket[]>('/admin/metrics/unmet-demand?limit=5').catch(() => []),
  ]);

  if (!metrics) {
    return (
      <>
        <div className="page-header">
          <div>
            <span className="eyebrow">Operations</span>
            <h1>Good to see you.</h1>
          </div>
        </div>
        <div className="alert alert--error" role="alert">
          We could not load platform metrics. Check the API connection and your metrics permission.
        </div>
      </>
    );
  }

  const queueFailures = queues.reduce((sum, queue) => sum + queue.failed, 0);
  const needsAttention = metrics.pendingListings + metrics.openReports + queueFailures;
  const todayLabel = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <>
      <div className="page-header page-header--hero">
        <div>
          <span className="eyebrow">{todayLabel}</span>
          <h1>Good morning, operations.</h1>
          <p>
            {needsAttention === 0
              ? 'Everything is calm. No urgent work is waiting.'
              : `${needsAttention} item${needsAttention === 1 ? '' : 's'} need attention across trust and platform health.`}
          </p>
        </div>
        <Link href="/moderation" className="btn btn--primary btn--with-icon">
          Open moderation
          <ConsoleIcon name="arrow" size={17} />
        </Link>
      </div>

      <section className="attention-strip" aria-label="Priority work">
        <div className="attention-strip__lead">
          <span className="attention-strip__icon">
            <ConsoleIcon name="shield" size={20} />
          </span>
          <span>
            <strong>Trust desk</strong>
            <small>What needs a human decision</small>
          </span>
        </div>
        <Link href="/moderation" className="attention-item">
          <strong>{metrics.pendingListings}</strong>
          <span>Pending review</span>
        </Link>
        <Link href="/reports" className="attention-item">
          <strong>{metrics.openReports}</strong>
          <span>Open reports</span>
        </Link>
        <Link href="/system" className="attention-item">
          <strong>{queueFailures}</strong>
          <span>Failed jobs</span>
        </Link>
      </section>

      <section className="metric-grid" aria-label="Key metrics">
        <Metric
          label="Published"
          value={metrics.publishedListings}
          note={`${metrics.listingsToday} added today`}
          icon="listings"
        />
        <Metric
          label="People"
          value={metrics.totalUsers}
          note={`${metrics.newUsersThisWeek} joined this week`}
          icon="users"
          tone="blue"
        />
        <Metric
          label="Businesses"
          value={metrics.totalBusinesses}
          note={`${metrics.verifiedBusinesses} verified`}
          icon="building"
          tone="amber"
        />
        <Metric
          label="Live economy"
          value={metrics.openJobs + metrics.liveOffers}
          note={`${metrics.openJobs} jobs · ${metrics.liveOffers} offers`}
          icon="briefcase"
          tone="coral"
        />
      </section>

      <div className="dashboard-grid">
        <section className="panel panel--wide">
          <div className="panel__header">
            <div>
              <span className="panel__kicker">Publishing velocity</span>
              <h2>New listings, last 14 days</h2>
            </div>
            <span className="panel__summary">
              {daily.reduce((sum, item) => sum + item.count, 0).toLocaleString('en-IN')} total
            </span>
          </div>
          {daily.length ? (
            <DailyChart buckets={daily} />
          ) : (
            <PanelEmpty>No activity yet.</PanelEmpty>
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__kicker">Infrastructure</span>
              <h2>Platform health</h2>
            </div>
            <span
              className={`health-pill ${indexStatus?.available ? 'health-pill--good' : 'health-pill--warn'}`}
            >
              <span />
              {indexStatus?.available ? 'Healthy' : 'Check systems'}
            </span>
          </div>
          <div className="health-list">
            <HealthRow
              label="Search index"
              detail={
                indexStatus
                  ? `${indexStatus.indexedDocuments ?? 0} documents · ${indexStatus.drift} drift`
                  : 'Status unavailable'
              }
              healthy={Boolean(indexStatus?.available)}
            />
            {queues.map((queue) => (
              <HealthRow
                key={queue.name}
                label={`${sentenceCase(queue.name)} queue`}
                detail={
                  queue.available
                    ? `${queue.waiting} waiting · ${queue.active} active`
                    : 'Connection unavailable'
                }
                healthy={queue.available && queue.failed === 0}
              />
            ))}
          </div>
          <Link href="/system" className="panel__link">
            View system details <ConsoleIcon name="arrow" size={15} />
          </Link>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__kicker">Local pulse</span>
              <h2>Listings by city</h2>
            </div>
          </div>
          {byCity.length ? (
            <BarList buckets={byCity} />
          ) : (
            <PanelEmpty>No city data yet.</PanelEmpty>
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__kicker">Marketplace mix</span>
              <h2>Top categories</h2>
            </div>
          </div>
          {byCategory.length ? (
            <BarList buckets={byCategory} warm />
          ) : (
            <PanelEmpty>No category data yet.</PanelEmpty>
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__kicker">Buyer Intent & Demand</span>
              <h2>Unmet Search Demand</h2>
            </div>
            {demand ? (
              <span className="health-pill health-pill--good">
                <span />
                {Math.round(demand.demandFulfillmentRate * 100)}% Fulfilled
              </span>
            ) : null}
          </div>
          {unmetDemand.length ? (
            <BarList buckets={unmetDemand} warm />
          ) : (
            <PanelEmpty>All buyer search requirements are currently fulfilled.</PanelEmpty>
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__kicker">Audience interest</span>
              <h2>Most viewed</h2>
            </div>
            <Link href="/listings" className="text-link">
              All listings
            </Link>
          </div>
          {topListings.length ? (
            <ol className="ranking-list">
              {topListings.map((listing, index) => (
                <li key={listing.id}>
                  <span className="ranking-list__number">{index + 1}</span>
                  <span className="ranking-list__copy">
                    <strong>{listing.title}</strong>
                    <small>{listing.cityName}</small>
                  </span>
                  <span className="ranking-list__value">
                    {listing.viewCount.toLocaleString('en-IN')}
                    <small>views</small>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <PanelEmpty>No viewing data yet.</PanelEmpty>
          )}
        </section>
      </div>
    </>
  );
}

function DailyChart({ buckets }: { buckets: Bucket[] }) {
  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);

  return (
    <div
      className="daily-chart"
      role="img"
      aria-label="Daily listing creation for the last 14 days"
    >
      {buckets.map((bucket, index) => (
        <div className="daily-chart__column" key={bucket.id}>
          <span className="daily-chart__value">{bucket.count}</span>
          <div
            className="daily-chart__bar"
            style={{ height: `${Math.max(8, (bucket.count / max) * 100)}%` }}
          />
          <small>
            {index === 0 || index === buckets.length - 1 || index === Math.floor(buckets.length / 2)
              ? new Date(`${bucket.label}T00:00:00`).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })
              : ''}
          </small>
        </div>
      ))}
    </div>
  );
}

function BarList({ buckets, warm = false }: { buckets: Bucket[]; warm?: boolean }) {
  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);

  return (
    <ul className={`bar-list${warm ? ' bar-list--warm' : ''}`}>
      {buckets.map((bucket) => (
        <li key={bucket.id}>
          <div>
            <span>{bucket.label}</span>
            <strong>{bucket.count.toLocaleString('en-IN')}</strong>
          </div>
          <span className="bar-list__track">
            <span style={{ width: `${Math.round((bucket.count / max) * 100)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function HealthRow({
  label,
  detail,
  healthy,
}: {
  label: string;
  detail: string;
  healthy: boolean;
}) {
  return (
    <div className="health-row">
      <span className={`health-row__dot${healthy ? ' health-row__dot--good' : ''}`} />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}

function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="panel-empty">{children}</p>;
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export const dynamic = 'force-dynamic';
