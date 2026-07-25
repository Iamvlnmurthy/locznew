'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  // Exact match for the root so every page does not light up "Overview".
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {label}
    </Link>
  );
}
