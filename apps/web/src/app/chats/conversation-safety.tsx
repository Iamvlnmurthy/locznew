'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { blockUserAction } from './actions';

export function ConversationSafety({
  otherPartyId,
  labels,
}: {
  otherPartyId: string;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function block() {
    if (!window.confirm(labels.blockConfirm)) return;
    startTransition(async () => {
      const result = await blockUserAction(otherPartyId);
      if (result.ok) {
        router.push('/chats');
      } else {
        setError(result.error ?? labels.blockFailed);
      }
    });
  }

  return (
    <div className="chat-safety-actions">
      <button type="button" onClick={block} disabled={pending}>
        <Icon name="shield" /> {pending ? labels.blocking : labels.block}
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}
