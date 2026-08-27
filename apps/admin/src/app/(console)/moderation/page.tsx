import type { ModerationMediaQueueItem, ModerationQueueItem, Paginated } from '@locz/shared-types';
import { ApiRequestError, locz } from '@/lib/api';
import { QueueItem } from './queue-item';
import { MediaQueueItem } from './media-queue-item';

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

  const [listingResult, mediaResult] = await Promise.allSettled([
    locz.moderation.queue({ page, limit: 20 }),
    locz.moderation.mediaQueue({ page: 1, limit: 20 }),
  ]);

  if (listingResult.status === 'rejected') {
    const error = listingResult.reason as unknown;
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

  const queue: Paginated<ModerationQueueItem> = listingResult.value;
  const mediaQueue: Paginated<ModerationMediaQueueItem> | null =
    mediaResult.status === 'fulfilled' ? mediaResult.value : null;
  const mediaError =
    mediaResult.status === 'rejected'
      ? mediaResult.reason instanceof ApiRequestError
        ? mediaResult.reason.message
        : 'Could not load the image queue. Listing moderation remains available.'
      : null;

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

      <section className="moderation-media" aria-labelledby="media-review-heading">
        <div className="page-header">
          <div>
            <span className="eyebrow">Image safety</span>
            <h2 id="media-review-heading">Quarantined images</h2>
            <p>
              {!mediaQueue
                ? 'Image review is temporarily unavailable.'
                : mediaQueue.meta.total === 0
                  ? 'No images are waiting for review.'
                  : `${mediaQueue.meta.total} image${mediaQueue.meta.total === 1 ? '' : 's'} need a decision.`}
            </p>
          </div>
        </div>
        {mediaError ? (
          <div className="alert alert--error" role="alert">
            {mediaError}
          </div>
        ) : mediaQueue && mediaQueue.items.length > 0 ? (
          <div className="media-review-grid">
            {mediaQueue.items.map((item) => (
              <MediaQueueItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="card empty">The image queue is clear.</div>
        )}
      </section>
    </>
  );
}
