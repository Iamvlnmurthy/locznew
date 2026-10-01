'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConsoleIcon } from './console-icon';

export function WorkspaceHeader({
  sections,
}: {
  sections: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();
  const current = [...sections]
    .sort((a, b) => b.href.length - a.href.length)
    .find(({ href }) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`)));

  return (
    <header className="workspace__bar">
      <nav className="workspace__breadcrumb" aria-label="Breadcrumb">
        <Link href="/">LocZ admin</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{current?.label ?? 'Workspace'}</span>
      </nav>
      <a
        className="workspace__site-link"
        href="https://locz.in"
        target="_blank"
        rel="noopener noreferrer"
      >
        View website <ConsoleIcon name="arrow" size={15} />
      </a>
    </header>
  );
}
