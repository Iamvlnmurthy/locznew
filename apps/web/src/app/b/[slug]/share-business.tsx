'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';

export function ShareBusiness({
  name,
  city,
  labels: l,
}: {
  name: string;
  city?: string;
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

  function shareWhatsApp() {
    const text = `🛍️ *${name}*${city ? ` in ${city}` : ''} on LocZ\nFind opening hours, contact details & local services:\n${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <button
        type="button"
        onClick={shareWhatsApp}
        className="business-profile-share is-wa-share"
        title="Share on WhatsApp"
      >
        <Icon name="message" /> WhatsApp
      </button>
      <button type="button" onClick={share} className="business-profile-share">
        <Icon name={copied ? 'check' : 'arrow'} />
        {copied ? l.linkCopied : l.share}
      </button>
    </div>
  );
}
