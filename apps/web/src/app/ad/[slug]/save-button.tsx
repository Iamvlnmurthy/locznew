'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toggleSaveAction } from './actions';

/**
 * Optimistic save toggle. The heart flips immediately and reverts if the server
 * disagrees — a save is trivial to undo, so waiting on a round trip costs more than the
 * rare correction.
 */
export function SaveButton({
  listingId,
  initialSaved,
  isSignedIn,
  labels,
}: {
  listingId: string;
  initialSaved: boolean;
  isSignedIn: boolean;
  labels: { save: string; saved: string };
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (!isSignedIn) {
      // Saving requires an account; send them to sign-in and bring them back here.
      router.push(`/signin?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const next = !saved;
    setSaved(next);

    startTransition(async () => {
      const result = await toggleSaveAction(listingId, next);
      if (!result.ok) setSaved(!next);
    });
  }

  return (
    <button
      type="button"
      className={`btn ${saved ? 'btn--primary' : 'btn--outline'} btn--block`}
      onClick={onClick}
      disabled={isPending}
      aria-pressed={saved}
    >
      <span aria-hidden="true">{saved ? '♥' : '♡'}</span>
      {saved ? labels.saved : labels.save}
    </button>
  );
}
