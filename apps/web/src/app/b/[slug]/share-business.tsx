'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';

export function ShareBusiness({
  name,
  labels: l,
}: {
  name: string;
  labels: Record<string, string>;
}) {
  const [copied, setCopied] = useState(false);

  async function share(): Promise<void> {
    try {
      if (navigator.share) {
        await navigator.share({
          title: name,
          text: l.shareText ? l.shareText.replace('{name}', name) : `Check out ${name} on LocZ!`,
          url: window.location.href,
        });
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Closing the native share sheet is an intentional user action.
    }
  }

  return (
    <button type="button" onClick={share} className="business-profile-share">
      <Icon name={copied ? 'check' : 'arrow'} />
      {copied ? l.linkCopied : l.share}
    </button>
  );
}
