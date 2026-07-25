import type { ModerationQueueItem, Paginated } from '@locz/shared-types';
import { ApiRequestError, locz } from '@/lib/api';
import { QueueItem } from './queue-item';

export const dynamic = 'force-dynamic';

/**
 * The moderation queue — oldest first, because a listing waiting since yesterday matters
 * more than one submitted a minute ago. Never cached: two moderators working the same
 * queue must not be shown listings a colleague has already handled.
 */
export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? '1') || 1);

  let queue: Paginated<ModerationQueueItem>;
  try {
    queue = await locz.moderation.queue({ page, limit: 20 });
  } catch (error) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1>Moderation queue</h1>
          </div>
        </div>
        <div className="alert alert--error" role="alert">
          {error instanceof ApiRequestError
            ? error.message
            : 'Could not load the queue. Check that the API is running.'}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Moderation queue</h1>
          <p>
            {queue.meta.total === 0
              ? 'Nothing waiting'
              : `${queue.meta.total} listing${queue.meta.total === 1 ? '' : 's'} awaiting review, oldest first`}
          </p>
        </div>
      </div>

      {queue.items.length === 0 ? (
        <div className="card empty">
          <p style={{ fontSize: '1.125rem', margin: 0 }}>The queue is clear.</p>
          <p style={{ margin: '8px 0 0' }}>
            New listings from first-time posters and anything the rules flag will appear here.
          </p>
        </div>
      ) : (
        <div className="queue">
          {queue.items.map((item) => (
            <QueueItem key={item.id} item={item} />
          ))}
        </div>
      )}

      {queue.meta.totalPages > 1 ? (
        <nav
          style={{ display: 'flex', gap: 12, marginTop: 24, alignItems: 'center' }}
          aria-label="Pagination"
        >
          {page > 1 ? (
            <a className="btn btn--ghost" href={`/moderation?page=${page - 1}`}>
              ← Previous
            </a>
          ) : null}
          <span className="metric__hint">
            Page {queue.meta.page} of {queue.meta.totalPages}
          </span>
          {queue.meta.hasNextPage ? (
            <a className="btn btn--ghost" href={`/moderation?page=${page + 1}`}>
              Next →
            </a>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
