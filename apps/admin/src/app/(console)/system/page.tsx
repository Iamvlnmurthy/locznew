import type { SearchIndexStatus } from '@locz/shared-types';
import { api } from '@/lib/api';
import { RebuildIndexButton } from './rebuild-button';

export const dynamic = 'force-dynamic';

interface QueueHealth {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  available: boolean;
}

interface StorageStats {
  mediaCount: number;
  totalBytes: number;
  failedCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export default async function SystemPage() {
  const [indexStatus, queues, storage] = await Promise.all([
    api<SearchIndexStatus>('/search/index/status').catch(() => null),
    api<QueueHealth[]>('/admin/queues').catch(() => []),
    api<StorageStats>('/admin/storage').catch(() => null),
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>System</h1>
          <p>Search index, background queues and storage</p>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Search index</h2>

        {!indexStatus ? (
          <p className="metric__hint">Could not reach the API.</p>
        ) : (
          <>
            <p style={{ margin: '0 0 8px' }}>
              <span className={`badge badge--${indexStatus.available ? 'published' : 'rejected'}`}>
                {indexStatus.available ? 'Online' : 'Unreachable'}
              </span>
            </p>
            <p style={{ margin: '0 0 4px' }}>
              {(indexStatus.indexedDocuments ?? 0).toLocaleString('en-IN')} documents indexed ·{' '}
              {indexStatus.publishedListings.toLocaleString('en-IN')} published listings
            </p>
            <p className="metric__hint" style={{ marginTop: 0 }}>
              {indexStatus.drift === 0
                ? 'The index is in step with the database.'
                : `${indexStatus.drift} listing(s) out of step. Drift is normal briefly after a burst of activity — a rebuild resolves it.`}
            </p>

            <div style={{ marginTop: 16 }}>
              <RebuildIndexButton />
            </div>

            <p className="metric__hint" style={{ marginTop: 12 }}>
              A rebuild is always safe: PostgreSQL is the source of truth, so nothing can be lost.
              It also runs automatically every night at 04:00 IST.
            </p>
          </>
        )}
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Background queues</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Queue</th>
                <th style={{ textAlign: 'right' }}>Waiting</th>
                <th style={{ textAlign: 'right' }}>Active</th>
                <th style={{ textAlign: 'right' }}>Delayed</th>
                <th style={{ textAlign: 'right' }}>Failed</th>
              </tr>
            </thead>
            <tbody>
              {queues.length === 0 ? (
                <tr>
                  <td colSpan={5} className="metric__hint">
                    Queue statistics unavailable — is Redis running?
                  </td>
                </tr>
              ) : (
                queues.map((queue) => (
                  <tr key={queue.name}>
                    <td>{queue.name}</td>
                    <td style={{ textAlign: 'right' }}>{queue.available ? queue.waiting : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{queue.available ? queue.active : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{queue.available ? queue.delayed : '—'}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        color: queue.failed > 0 ? 'var(--locz-danger)' : undefined,
                        fontWeight: queue.failed > 0 ? 600 : undefined,
                      }}
                    >
                      {queue.available ? queue.failed : 'unreachable'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Storage</h2>
        {!storage ? (
          <p className="metric__hint">Statistics unavailable.</p>
        ) : (
          <div className="metric-grid" style={{ marginBottom: 0 }}>
            <div>
              <p className="metric__label">Images stored</p>
              <p className="metric__value">{storage.mediaCount.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="metric__label">Original bytes</p>
              <p className="metric__value">{formatBytes(storage.totalBytes)}</p>
              <p className="metric__hint">Excludes generated renditions</p>
            </div>
            <div>
              <p className="metric__label">Failed uploads</p>
              <p
                className="metric__value"
                style={{ color: storage.failedCount > 0 ? 'var(--locz-warning)' : undefined }}
              >
                {storage.failedCount}
              </p>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
