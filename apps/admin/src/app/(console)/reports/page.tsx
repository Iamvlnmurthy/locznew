import type { Paginated } from '@locz/shared-types';
import { ApiRequestError, api } from '@/lib/api';
import { ReportCard, type ReportItem } from './report-card';

export const dynamic = 'force-dynamic';

/**
 * The report queue. Oldest first for the same reason as moderation: a complaint sitting
 * since yesterday matters more than one filed a minute ago.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? '1') || 1);

  const query = new URLSearchParams({ page: String(page), limit: '20' });
  if (params.status) query.set('status', params.status);

  let reports: Paginated<ReportItem>;
  try {
    reports = await api<Paginated<ReportItem>>(`/reports?${query.toString()}`);
  } catch (error) {
    return (
      <>
        <div className="page-header">
          <h1>Reports</h1>
        </div>
        <div className="alert alert--error" role="alert">
          {error instanceof ApiRequestError ? error.message : 'Could not load reports.'}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>
            {reports.meta.total === 0
              ? 'Nothing waiting'
              : `${reports.meta.total} open report${reports.meta.total === 1 ? '' : 's'}, oldest first`}
          </p>
        </div>
      </div>

      {reports.items.length === 0 ? (
        <div className="card empty">
          <p style={{ fontSize: '1.125rem', margin: 0 }}>No open reports.</p>
          <p style={{ margin: '8px 0 0' }}>
            Reports from users appear here. Three against the same listing pull it from public view
            automatically.
          </p>
        </div>
      ) : (
        <div className="queue">
          {reports.items.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}

      {reports.meta.totalPages > 1 ? (
        <nav
          style={{ display: 'flex', gap: 12, marginTop: 24, alignItems: 'center' }}
          aria-label="Pagination"
        >
          {page > 1 ? (
            <a className="btn btn--ghost" href={`/reports?page=${page - 1}`}>
              ← Previous
            </a>
          ) : null}
          <span className="metric__hint">
            Page {reports.meta.page} of {reports.meta.totalPages}
          </span>
          {reports.meta.hasNextPage ? (
            <a className="btn btn--ghost" href={`/reports?page=${page + 1}`}>
              Next →
            </a>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
