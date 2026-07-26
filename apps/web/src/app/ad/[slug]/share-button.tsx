'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';

export function ShareButton({ title, labels }: { title: string; labels: Record<string, string> }) {
  const [feedback, setFeedback] = useState<string | null>(null);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title,
          text: labels.shareText.replace('{title}', title),
          url: location.href,
        });
        setFeedback(labels.shared);
      } else {
        await navigator.clipboard.writeText(location.href);
        setFeedback(labels.linkCopied);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFeedback(labels.shareFailed);
    }
    window.setTimeout(() => setFeedback(null), 2200);
  }

  return (
    <button type="button" className="detail-action" onClick={share} aria-live="polite">
      <Icon name="share" />
      <span>{feedback ?? labels.share}</span>
    </button>
  );
}
