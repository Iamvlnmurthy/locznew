'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConsoleIcon, type ConsoleIconName } from './console-icon';

export function NavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ConsoleIconName;
}) {
  const pathname = usePathname();
  // Exact match for the root so every page does not light up "Overview".
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className="sidebar__link-content">
        <ConsoleIcon name={icon} />
        {label}
      </span>
      <span className="sidebar__link-marker" aria-hidden="true" />
    </Link>
  );
}
