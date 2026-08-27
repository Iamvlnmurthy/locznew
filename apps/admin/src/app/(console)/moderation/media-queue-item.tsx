'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ModerationMediaQueueItem } from '@locz/shared-types';
import {
  approveMediaAction,
  blockMediaAction,
  previewMediaAction,
  type ModerationActionState,
} from './actions';

const INITIAL: ModerationActionState = {};

function PendingButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function MediaQueueItem({ item }: { item: ModerationMediaQueueItem }) {
  const [previewState, preview] = useActionState(previewMediaAction, INITIAL);
  const [approveState, approve] = useActionState(approveMediaAction, INITIAL);
  const [blockState, block] = useActionState(blockMediaAction, INITIAL);
  const error = previewState.error ?? approveState.error ?? blockState.error;
  const message = approveState.message ?? blockState.message;

  return (
    <article className="card media-review-card">
      <div className="media-review-card__copy">
        <span className="eyebrow">Quarantined image</span>
        <h2>{item.listingTitle}</h2>
        <p>
          Uploaded by {item.uploaderName} · waiting since{' '}
          {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(
            new Date(item.createdAt),
          )}
        </p>
        {item.failureReason ? (
          <div className="alert alert--warning">{item.failureReason}</div>
        ) : null}
      </div>

      <div className="media-review-card__preview">
        {previewState.previewUrl ? (
          // This is a short-lived private moderation URL, not a public asset suitable for
          // Next Image optimisation or caching.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewState.previewUrl} alt={`Moderation preview for ${item.listingTitle}`} />
        ) : (
          <form action={preview}>
            <input type="hidden" name="mediaId" value={item.id} />
            <PendingButton
              className="btn btn--ghost"
              label="Load private preview"
              pendingLabel="Loading preview…"
            />
          </form>
        )}
      </div>

      <div className="media-review-card__actions">
        <form action={approve}>
          <input type="hidden" name="mediaId" value={item.id} />
          <PendingButton
            className="btn btn--primary"
            label="Approve and publish"
            pendingLabel="Publishing…"
          />
        </form>
        <form action={block} className="media-review-card__reject">
          <input type="hidden" name="mediaId" value={item.id} />
          <label htmlFor={`media-reason-${item.id}`}>Reason for blocking</label>
          <div>
            <input
              id={`media-reason-${item.id}`}
              name="reason"
              minLength={10}
              maxLength={300}
              required
              placeholder="Explain what is unsafe or prohibited"
            />
            <PendingButton
              className="btn btn--danger"
              label="Block image"
              pendingLabel="Blocking…"
            />
          </div>
        </form>
      </div>
      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert--success" role="status">
          {message}
        </div>
      ) : null}
    </article>
  );
}
