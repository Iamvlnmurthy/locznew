'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
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
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    if (!isSignedIn) {
      // Saving requires an account; send them to sign-in and bring them back here.
      router.push(`/signin?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const next = !saved;
    setSaved(next);
    setFailed(false);

    startTransition(async () => {
      const result = await toggleSaveAction(listingId, next);
      if (!result.ok) {
        setSaved(!next);
        setFailed(true);
      }
    });
  }

  return (
    <button
      type="button"
      className={`detail-action${saved ? ' is-saved' : ''}`}
      onClick={onClick}
      disabled={isPending}
      aria-pressed={saved}
    >
      <Icon name="heart" />
      <span>{failed ? labels.tryAgain : saved ? labels.saved : labels.save}</span>
    </button>
  );
}
