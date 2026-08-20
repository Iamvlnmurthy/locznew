'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type MouseEvent, type ReactNode } from 'react';

export function DiscoveryMotionLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [launching, setLaunching] = useState(false);

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      launching ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    event.preventDefault();
    setLaunching(true);
    timer.current = setTimeout(() => router.push(href), 190);
  }

  return (
    <Link
      href={href}
      className={`${className}${launching ? ' is-launching' : ''}`}
      aria-current={launching ? 'page' : undefined}
      onClick={navigate}
    >
      {children}
    </Link>
  );
}
