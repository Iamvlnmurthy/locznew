import type { Paginated } from '@locz/shared-types';
import { ApiRequestError, api } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface AdminUser {
  id: string;
  /** Null on an account created by Google sign-up that has not confirmed a number. */
  phone: string | null;
  email: string | null;
  displayName: string;
  status: string;
  roles: string[];
  listingCount: number;
  reportsAgainst: number;
  createdAt: string;
  lastActiveAt: string | null;
}

function statusBadge(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'badge badge--published';
    case 'SUSPENDED':
      return 'badge badge--rejected';
    default:
      return 'badge badge--pending';
  }
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? '1') || 1);

  const query = new URLSearchParams({ page: String(page), limit: '25' });
  if (params.q) query.set('q', params.q);

  let result: Paginated<AdminUser>;
  try {
    result = await api<Paginated<AdminUser>>(`/admin/users?${query.toString()}`);
  } catch (error) {
    return (
      <>
        <div className="page-header">
          <h1>Users</h1>
        </div>
        <div className="alert alert--error" role="alert">
          {error instanceof ApiRequestError ? error.message : 'Could not load users.'}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p>{result.meta.total.toLocaleString('en-IN')} accounts</p>
        </div>
      </div>

      <form className="card" style={{ marginBottom: 16 }} action="/users" method="get">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 260px' }}>
            <label htmlFor="q">Find an account</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={params.q ?? ''}
              placeholder="Name, phone number or email"
            />
          </div>
          <button type="submit" className="btn btn--primary">
            Search
          </button>
        </div>
      </form>

      {result.items.length === 0 ? (
        <div className="card empty">
          <p>No accounts match that search.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Roles</th>
                <th style={{ textAlign: 'right' }}>Listings</th>
                <th style={{ textAlign: 'right' }}>Reports</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((user) => (
                <tr key={user.id}>
                  <td style={{ overflowWrap: 'anywhere' }}>
                    {user.displayName}
                    {user.email ? (
                      <div className="metric__hint" style={{ margin: 0 }}>
                        {user.email}
                      </div>
                    ) : null}
                  </td>
                  {/* Null on an account created by Google sign-up. An empty cell reads as
                      a rendering fault; an em dash says the platform does not have one. */}
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{user.phone ?? '—'}</td>
                  <td>
                    <span className={statusBadge(user.status)}>{user.status.toLowerCase()}</span>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--locz-text-secondary)' }}>
                    {user.roles
                      .filter((role) => role !== 'REGISTERED_USER')
                      .map((role) => role.toLowerCase().replace(/_/g, ' '))
                      .join(', ') || 'user'}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {user.listingCount}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: user.reportsAgainst > 0 ? 'var(--locz-danger)' : undefined,
                      fontWeight: user.reportsAgainst > 0 ? 600 : undefined,
                    }}
                  >
                    {user.reportsAgainst}
                  </td>
                  <td>
                    {new Date(user.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.meta.totalPages > 1 ? (
        <nav
          style={{ display: 'flex', gap: 12, marginTop: 24, alignItems: 'center' }}
          aria-label="Pagination"
        >
          {page > 1 ? (
            <a className="btn btn--ghost" href={`/users?page=${page - 1}`}>
              ← Previous
            </a>
          ) : null}
          <span className="metric__hint">
            Page {result.meta.page} of {result.meta.totalPages}
          </span>
          {result.meta.hasNextPage ? (
            <a className="btn btn--ghost" href={`/users?page=${page + 1}`}>
              Next →
            </a>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
