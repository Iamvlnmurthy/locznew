'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function ChatRefresh({ latestMessageId }: { latestMessageId?: string }) {
  const router = useRouter();

  useEffect(() => {
    document.getElementById('latest-message')?.scrollIntoView({ block: 'end' });
  }, [latestMessageId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}
