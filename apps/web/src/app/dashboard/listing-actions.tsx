'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { listingCommandAction, type ListingCommand } from './actions';

/**
 * Per-listing controls. Which commands appear depends on the current status, so the
 * dashboard never offers an action the API would reject.
 */
export function ListingActions({
  listingId,
  status,
  labels,
}: {
  listingId: string;
  status: string;
  labels: Record<
    | 'edit'
    | 'resumeDraft'
    | 'pause'
    | 'resume'
    | 'markSold'
    | 'republish'
    | 'delete'
    | 'deleteConfirm'
    | 'failed',
    string
  >;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(command: ListingCommand, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    startTransition(async () => {
      const result = await listingCommandAction(listingId, command);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error ?? labels.failed);
      }
    });
  }

  const available: Array<{ command: ListingCommand; label: string; confirm?: string }> = [];

  if (status === 'PUBLISHED') {
    available.push({ command: 'pause', label: labels.pause });
    available.push({ command: 'sold', label: labels.markSold });
  }
  if (status === 'PAUSED') {
    available.push({ command: 'resume', label: labels.resume });
    available.push({ command: 'sold', label: labels.markSold });
  }
  if (status === 'EXPIRED' || status === 'SOLD') {
    available.push({ command: 'republish', label: labels.republish });
  }

  // Deleting is always available and always confirmed — it is the one irreversible
  // action on this screen.
  available.push({ command: 'delete', label: labels.delete, confirm: labels.deleteConfirm });

  return (
    <>
      <div className="dashboard-listing-actions">
        {status !== 'REMOVED' ? (
          <Link href={`/post/${listingId}/edit`} className="btn btn--outline">
            {status === 'DRAFT' ? labels.resumeDraft : labels.edit}
          </Link>
        ) : null}
        {available.map((action) => (
          <button
            key={action.command}
            type="button"
            className={`btn btn--outline${action.command === 'delete' ? ' is-danger' : ''}`}
            disabled={isPending}
            onClick={() => run(action.command, action.confirm)}
          >
            {action.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
