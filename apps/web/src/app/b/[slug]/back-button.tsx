'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';

/**
 * Back control for the storefront. Goes back in history when there is somewhere to go, and falls
 * back to Home for a cold entry (a shared link or a search-result landing) so it never dead-ends.
 */
export function BusinessBackButton({ label }: { label: string }) {
  const router = useRouter();

  const onBack = () => {
    if (window.history.length > 1) router.back();
    else router.push('/');
  };

  return (
    <button type="button" className="business-profile-back" onClick={onBack} aria-label={label}>
      <Icon name="arrow" />
      <span>{label}</span>
    </button>
  );
}
