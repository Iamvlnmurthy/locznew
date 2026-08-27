'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';

export function CopyAddressButton({
  address,
  children,
}: {
  address: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard copy fail-safe
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`business-profile-address-copy ${copied ? 'is-copied' : ''}`}
      title="Click to copy full address"
      aria-label="Copy address to clipboard"
    >
      <span className="business-profile-address-copy__icon">
        <Icon name={copied ? 'check' : 'location'} />
      </span>
      <span className="business-profile-address-copy__text">{children}</span>
      <span className="business-profile-address-copy__badge">{copied ? 'Copied!' : 'Copy'}</span>
    </button>
  );
}
