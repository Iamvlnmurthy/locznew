'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { type ModerationQueueItem, moderationReasonLabel } from '@locz/shared-types';
import { approveListingAction, rejectListingAction, type ModerationActionState } from './actions';

/** Reasons that on their own justify rejecting rather than merely checking. */
const SEVERE_REASONS = ['SHORTENED_URL', 'DUPLICATE_LISTING', 'PAYMENT_UPFRONT_LANGUAGE'];

function isSevere(reason: string): boolean {
  return reason.startsWith('BANNED_KEYWORD:') || SEVERE_REASONS.includes(reason);
}

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
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function QueueItem({ item }: { item: ModerationQueueItem }) {
  const [showReject, setShowReject] = useState(false);

  const [approveState, approve] = useActionState<ModerationActionState, FormData>(
    approveListingAction,
    {},
  );
  const [rejectState, reject] = useActionState<ModerationActionState, FormData>(
    rejectListingAction,
    {},
  );

  const error = approveState.error ?? rejectState.error;
  const isNewSeller = item.ownerPublishedCount === 0;

  return (
    <article className="card queue-item">
      <div>
        {/* Titles and names are unmoderated user input. React escapes them; the CSS
            keeps a 200-character unbroken string from destroying the layout. */}
        <h2 className="queue-item__title">{item.title}</h2>

        <p className="queue-item__meta">
          {item.categoryName} · {item.cityName} ·{' '}
          {item.price !== null ? `₹${item.price.toLocaleString('en-IN')}` : 'No price'} ·{' '}
          {item.imageCount} image{item.imageCount === 1 ? '' : 's'}
          {item.reportCount > 0 ? (
            <>
              {' · '}
              <strong style={{ color: 'var(--locz-danger)' }}>
                {item.reportCount} report{item.reportCount === 1 ? '' : 's'}
              </strong>
            </>
          ) : null}
        </p>

        <p className="queue-item__meta" style={{ marginTop: 4 }}>
          {item.ownerName}
          {isNewSeller ? (
            <span className="badge badge--pending" style={{ marginLeft: 8 }}>
              First listing
            </span>
          ) : (
            <> · {item.ownerPublishedCount} published already</>
          )}
          {' · '}
          {new Date(item.createdAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </p>

        {item.systemReasons.length > 0 ? (
          <ul className="queue-item__reasons">
            {item.systemReasons.map((reason) => (
              <li
                key={reason}
                className={`reason${isSevere(reason) ? ' reason--severe' : ''}`}
                title={reason}
              >
                {moderationReasonLabel(reason)}
              </li>
            ))}
          </ul>
        ) : null}

        {item.moderationScore !== null ? (
          <p className="metric__hint" style={{ marginTop: 8 }}>
            Automated score {item.moderationScore}/100
          </p>
        ) : null}

        {error ? (
          <div className="alert alert--error" style={{ marginTop: 12 }} role="alert">
            {error}
          </div>
        ) : null}
      </div>

      <div className="queue-actions">
        {!showReject ? (
          <>
            <form action={approve}>
              <input type="hidden" name="listingId" value={item.id} />
              <PendingButton
                label="Approve & publish"
                pendingLabel="Publishing…"
                className="btn btn--primary"
              />
            </form>
            <button type="button" className="btn btn--ghost" onClick={() => setShowReject(true)}>
              Reject…
            </button>
          </>
        ) : (
          <form action={reject}>
            <input type="hidden" name="listingId" value={item.id} />
            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor={`reason-${item.id}`}>Reason (the poster sees this)</label>
              <textarea
                id={`reason-${item.id}`}
                name="reason"
                rows={3}
                required
                minLength={5}
                placeholder="Contact details belong in the contact fields, not the description."
              />
            </div>
            <PendingButton
              label="Confirm rejection"
              pendingLabel="Rejecting…"
              className="btn btn--danger"
            />
            <button
              type="button"
              className="btn btn--ghost"
              style={{ marginTop: 8, width: '100%' }}
              onClick={() => setShowReject(false)}
            >
              Cancel
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
