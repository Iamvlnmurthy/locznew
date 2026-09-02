import Link from 'next/link';
import styles from './mobile-section-nav.module.css';

type SectionLink = { href: string; label: string };

/**
 * Mobile-only horizontal strip of the primary content sections (Businesses, News, Jobs, Services,
 * Public Services, Local now). On phones the desktop `.header__primary` nav is hidden, which left
 * these sections unreachable from the header — the bottom dock is task-based (Home/Search/Post/
 * Saved/Alerts) and stays ≤5. This strip restores section discovery without touching the dock.
 * Server component: pure render from the links the header already computes.
 */
export function MobileSectionNav({
  links,
  pathname,
  label,
}: {
  links: SectionLink[];
  pathname: string;
  label: string;
}) {
  return (
    <nav className={styles.strip} aria-label={label}>
      <div className={styles.track}>
        {links.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? styles.active : undefined}
              aria-current={active ? 'page' : undefined}
              prefetch={false}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
