import type { Paginated } from '@locz/shared-types';
import { ApiRequestError, api } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  actorRole: string | null;
  changes: Record<string, unknown> | null;
  ip: string | null;
  correlationId: string | null;
  createdAt: string;
}

/** Actions worth spotting at a glance in a long list. */
const NOTABLE = ['user.suspend', 'listing.delete', 'business.verification', 'moderation.reject'];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    actorId?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? '1') || 1);

  const query = new URLSearchParams({ page: String(page), limit: '50' });
  for (const key of ['entityType', 'entityId', 'action', 'actorId'] as const) {
    if (params[key]) query.set(key, params[key]!);
  }

  let logs: Paginated<AuditLog>;
  try {
    logs = await api<Paginated<AuditLog>>(`/admin/audit-logs?${query.toString()}`);
  } catch (error) {
    return (
      <>
        <div className="page-header">
          <h1>Audit logs</h1>
        </div>
        <div className="alert alert--error" role="alert">
          {error instanceof ApiRequestError ? error.message : 'Could not load the audit trail.'}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Audit logs</h1>
          <p>{logs.meta.total.toLocaleString('en-IN')} recorded actions, newest first</p>
        </div>
      </div>

      <form className="card" style={{ marginBottom: 16 }} action="/audit" method="get">
        {params.actorId ? <input type="hidden" name="actorId" value={params.actorId} /> : null}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ marginBottom: 0, flex: '0 1 180px' }}>
            <label htmlFor="entityType">Entity type</label>
            <select id="entityType" name="entityType" defaultValue={params.entityType ?? ''}>
              <option value="">All</option>
              <option value="Listing">Listing</option>
              <option value="User">User</option>
              <option value="Business">Business</option>
              <option value="Report">Report</option>
              <option value="Category">Category</option>
              <option value="CategoryAttribute">Category attribute</option>
              <option value="Session">Session</option>
              <option value="Device">Device</option>
              <option value="BusinessClaim">Business claim</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
            <label htmlFor="entityId">Entity id</label>
            <input
              id="entityId"
              name="entityId"
              defaultValue={params.entityId ?? ''}
              placeholder="Reconstruct one item's history"
            />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: '0 1 180px' }}>
            <label htmlFor="action">Action contains</label>
            <input
              id="action"
              name="action"
              defaultValue={params.action ?? ''}
              placeholder="approve"
            />
          </div>
          <button type="submit" className="btn btn--primary">
            Filter
          </button>
        </div>
      </form>

      {logs.items.length === 0 ? (
        <div className="card empty">
          <p>No matching entries.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Actor</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {logs.items.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                    {new Date(log.createdAt).toLocaleString('en-IN', {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })}
                  </td>
                  <td>
                    <code
                      style={{
                        fontSize: '0.75rem',
                        color: NOTABLE.includes(log.action) ? 'var(--locz-danger)' : undefined,
                        fontWeight: NOTABLE.includes(log.action) ? 600 : undefined,
                      }}
                    >
                      {log.action}
                    </code>
                  </td>
                  <td style={{ fontSize: '0.75rem' }}>
                    {log.entityType}
                    {log.entityId ? (
                      <a
                        href={`/audit?entityType=${log.entityType}&entityId=${log.entityId}`}
                        style={{ display: 'block', color: 'var(--locz-text-muted)' }}
                        title="Show everything that happened to this item"
                      >
                        {log.entityId.slice(0, 8)}…
                      </a>
                    ) : null}
                  </td>
                  <td style={{ fontSize: '0.75rem' }}>
                    {log.actorName ?? <em style={{ color: 'var(--locz-text-muted)' }}>system</em>}
                    {log.actorRole ? (
                      <div style={{ color: 'var(--locz-text-muted)' }}>
                        {log.actorRole.toLowerCase()}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ maxWidth: 340 }}>
                    {log.changes && Object.keys(log.changes).length > 0 ? (
                      // The audit service redacts credentials before storage, so whatever
                      // reaches here is safe to render.
                      <pre
                        style={{
                          margin: 0,
                          fontSize: '0.6875rem',
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          color: 'var(--locz-text-secondary)',
                        }}
                      >
                        {JSON.stringify(log.changes)}
                      </pre>
                    ) : (
                      <span style={{ color: 'var(--locz-text-muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logs.meta.totalPages > 1 ? (
        <nav
          style={{ display: 'flex', gap: 12, marginTop: 24, alignItems: 'center' }}
          aria-label="Pagination"
        >
          {page > 1 ? (
            <a className="btn btn--ghost" href={`/audit?page=${page - 1}`}>
              ← Previous
            </a>
          ) : null}
          <span className="metric__hint">
            Page {logs.meta.page} of {logs.meta.totalPages}
          </span>
          {logs.meta.hasNextPage ? (
            <a className="btn btn--ghost" href={`/audit?page=${page + 1}`}>
              Next →
            </a>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
