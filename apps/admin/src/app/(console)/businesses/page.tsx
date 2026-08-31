import type { Paginated } from '@locz/shared-types';
import { ApiRequestError, api } from '@/lib/api';
import { ConsoleIcon } from '../console-icon';
import { VerificationDecision } from './verification-decision';

export const dynamic = 'force-dynamic';

interface BusinessSummary {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  cityName: string;
  verificationStatus: string;
  listingCount: number;
  viewCount: number;
  description: string | null;
  addressLine: string | null;
  hours: Array<{ isClosed: boolean }>;
}

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const status = params.status ?? 'PENDING';
  const query = new URLSearchParams({ limit: '50', sort: 'newest' });
  if (params.q) query.set('q', params.q);
  if (status !== 'ALL') query.set('verificationStatus', status);

  let result: Paginated<BusinessSummary>;
  try {
    result = await api<Paginated<BusinessSummary>>(`/businesses?${query.toString()}`);
  } catch (error) {
    return (
      <>
        <div className="page-header">
          <h1>Businesses</h1>
        </div>
        <div className="alert alert--error" role="alert">
          {error instanceof ApiRequestError ? error.message : 'Could not load businesses.'}
        </div>
      </>
    );
  }

  const businesses = result.items.sort((left, right) => {
    if (left.verificationStatus === right.verificationStatus) return 0;
    return left.verificationStatus === 'PENDING' ? -1 : 1;
  });

  return (
    <>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Trust operations</span>
          <h1>Businesses</h1>
          <p>Review identity signals without turning verification into paid placement.</p>
        </div>
        <div className="business-review-summary">
          <strong>{result.meta.total}</strong>
          {status === 'PENDING' ? 'waiting for review' : 'businesses in this view'}
        </div>
      </div>

      <form className="business-review-filters" action="/businesses" method="get">
        <label>
          <ConsoleIcon name="search" size={17} />
          <input
            name="q"
            type="search"
            defaultValue={params.q ?? ''}
            placeholder="Find a business"
          />
        </label>
        <select name="status" defaultValue={status} aria-label="Verification status">
          <option value="PENDING">Waiting for review</option>
          <option value="UNVERIFIED">Not requested</option>
          <option value="VERIFIED">Verified</option>
          <option value="REJECTED">Needs correction</option>
          <option value="ALL">Every status</option>
        </select>
        <button type="submit" className="btn btn--primary">
          Apply
        </button>
      </form>

      {businesses.length ? (
        <div className="business-review-list">
          {businesses.map((business) => {
            const readiness = [
              business.description,
              business.addressLine,
              business.hours.length > 0,
            ].filter(Boolean).length;
            return (
              <article key={business.id} data-business-id={business.id}>
                <header>
                  <span className="business-review-logo">{business.name.slice(0, 1)}</span>
                  <div>
                    <span className="page-eyebrow">
                      {business.categoryName} · {business.cityName}
                    </span>
                    <h2>{business.name}</h2>
                    <p>{business.addressLine ?? 'No address supplied'}</p>
                  </div>
                  <span className={`badge badge--${business.verificationStatus.toLowerCase()}`}>
                    {statusLabel(business.verificationStatus)}
                  </span>
                </header>
                <div className="business-review-evidence">
                  <span className={business.description ? 'is-ready' : ''}>
                    <ConsoleIcon name={business.description ? 'shield' : 'pulse'} size={15} />
                    Description
                  </span>
                  <span className={business.addressLine ? 'is-ready' : ''}>
                    <ConsoleIcon name={business.addressLine ? 'shield' : 'pulse'} size={15} />
                    Address
                  </span>
                  <span className={business.hours.length ? 'is-ready' : ''}>
                    <ConsoleIcon name={business.hours.length ? 'shield' : 'pulse'} size={15} />
                    Hours
                  </span>
                  <a href={`https://locz.in/b/${business.slug}`} target="_blank" rel="noreferrer">
                    Open public profile <ConsoleIcon name="arrow" size={14} />
                  </a>
                </div>
                <div className="business-review-meta">
                  <span>
                    <strong>{readiness}/3</strong> visible signals
                  </span>
                  <span>
                    <strong>{business.listingCount}</strong> listings
                  </span>
                  <span>
                    <strong>{business.viewCount}</strong> profile views
                  </span>
                </div>
                {business.verificationStatus !== 'VERIFIED' ? (
                  <VerificationDecision businessId={business.id} slug={business.slug} />
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card empty">
          <ConsoleIcon name="building" size={36} />
          <h2>No businesses in this view</h2>
          <p>Change the status filter or search for another name.</p>
        </div>
      )}
    </>
  );
}

function statusLabel(status: string): string {
  if (status === 'PENDING') return 'Waiting';
  if (status === 'VERIFIED') return 'Verified';
  if (status === 'REJECTED') return 'Correction needed';
  return 'Not requested';
}
