'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';

/** A monospace code (IFSC/MICR) that copies itself on click — banking codes exist to be copied. */
export function CopyCode({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the code is still selectable as text.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`bank-code ${copied ? 'is-copied' : ''}`}
      aria-label={`Copy ${label ?? 'code'} ${value}`}
    >
      <span className="bank-code__value">{value}</span>
      <span className="bank-code__icon" aria-hidden="true">
        <Icon name={copied ? 'check' : 'code'} />
      </span>
      {copied ? <span className="bank-code__flash">Copied</span> : null}
    </button>
  );
}
