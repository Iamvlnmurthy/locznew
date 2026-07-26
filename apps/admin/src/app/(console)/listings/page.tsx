import type { ListingStatus, ListingSummary } from '@locz/shared-types';
import { ApiRequestError, api } from '@/lib/api';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All published' },
  { value: 'PRODUCT', label: 'Products' },
  { value: 'JOB', label: 'Jobs' },
  { value: 'OFFER', label: 'Offers' },
  { value: 'SERVICE', label: 'Services' },
  { value: 'RENTAL', label: 'Rentals' },
];

function statusClass(status: ListingStatus): string {
  switch (status) {
    case 'PUBLISHED':
      return 'badge badge--published';
    case 'PENDING_REVIEW':
      return 'badge badge--pending';
    case 'REJECTED':
    case 'REMOVED':
      return 'badge badge--rejected';
    default:
      return 'badge';
  }
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? '1') || 1);

  const query = new URLSearchParams({ page: String(page), limit: '25' });
  if (params.type) query.set('type', params.type);
  if (params.q) query.set('q', params.q);

  // The public search endpoint is reused deliberately: an administrator should see
  // exactly what a visitor sees, not a privileged variant that hides a rendering bug.
  let result: { items: ListingSummary[]; total: number; page: number; limit: number };
  try {
    const response = await api<{
      items: ListingSummary[];
      total: number;
      page: number;
      limit: number;
    }>(`/search?${query.toString()}`);
    result = response;
  } catch (error) {
    return (
      <>
        <div className="page-header">
          <h1>Listings</h1>
        </div>
        <div className="alert alert--error" role="alert">
          {error instanceof ApiRequestError ? error.message : 'Could not load listings.'}
        </div>
      </>
    );
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.limit));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Listings</h1>
          <p>{result.total.toLocaleString('en-IN')} published listings</p>
        </div>
      </div>

      <form className="card" style={{ marginBottom: 16 }} action="/listings" method="get">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 240px' }}>
            <label htmlFor="q">Search</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={params.q ?? ''}
              placeholder="Title, brand…"
            />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: '0 1 200px' }}>
            <label htmlFor="type">Type</label>
            <select id="type" name="type" defaultValue={params.type ?? ''}>
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn--primary">
            Apply
          </button>
        </div>
      </form>

      {result.items.length === 0 ? (
        <div className="card empty">
          <p>No listings match these filters.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Location</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Views</th>
                <th>Published</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((listing) => (
                <tr key={listing.id}>
                  <td style={{ maxWidth: 320, overflowWrap: 'anywhere' }}>
                    {listing.title}
                    {listing.isFeatured ? (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        Featured
                      </span>
                    ) : null}
                  </td>
                  <td>{listing.type.toLowerCase().replace(/_/g, ' ')}</td>
                  <td>
                    <span className={statusClass(listing.status)}>
                      {listing.status.toLowerCase().replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    {listing.cityName}
                    {listing.localityName ? `, ${listing.localityName}` : ''}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {listing.price !== null ? `₹${listing.price.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {listing.viewCount.toLocaleString('en-IN')}
                  </td>
                  <td>
                    {listing.publishedAt
                      ? new Date(listing.publishedAt).toLocaleDateString('en-IN', {
                          dateStyle: 'medium',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          style={{ display: 'flex', gap: 12, marginTop: 24, alignItems: 'center' }}
          aria-label="Pagination"
        >
          {page > 1 ? (
            <a className="btn btn--ghost" href={`/listings?page=${page - 1}`}>
              ← Previous
            </a>
          ) : null}
          <span className="metric__hint">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <a className="btn btn--ghost" href={`/listings?page=${page + 1}`}>
              Next →
            </a>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
