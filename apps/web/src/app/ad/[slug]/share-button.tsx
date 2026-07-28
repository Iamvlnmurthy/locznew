'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';

type ShareProps = {
  title: string;
  url: string;
  labels: Record<string, string>;
};

export function ShareButton({ title, url, labels }: ShareProps) {
  const [feedback, setFeedback] = useState<string | null>(null);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title,
          text: labels.shareText.replace('{title}', title),
          url,
        });
        setFeedback(labels.shared);
      } else {
        await navigator.clipboard.writeText(url);
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

export function WhatsAppShareButton({ title, url, labels }: ShareProps) {
  const text = `${labels.shareText.replace('{title}', title)}\n${url}`;

  return (
    <a
      className="detail-action"
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noreferrer"
    >
      <Icon name="share" />
      <span>{labels.whatsApp}</span>
    </a>
  );
}
