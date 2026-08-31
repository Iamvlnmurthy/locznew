import { redirect } from 'next/navigation';
import { getCurrentUser, hasPermission, type DisplayUser } from '@/lib/session';
import { logoutAction } from '../login/actions';
import { getAdminQueueCopy } from '@/lib/queue-copy';
import { NavLink } from './nav-link';
import type { ConsoleIconName } from './console-icon';

const NAV: Array<{
  href: string;
  label: string;
  icon: ConsoleIconName;
  permissions: string[];
}> = [
  { href: '/', label: 'Overview', icon: 'overview', permissions: ['metrics:read'] },
  {
    href: '/moderation',
    label: 'Moderation queue',
    icon: 'moderation',
    permissions: ['listing:moderate'],
  },
  { href: '/reports', label: 'Reports', icon: 'reports', permissions: ['report:resolve'] },
  { href: '/safety', label: 'Safety cases', icon: 'flag', permissions: ['safety:case:read'] },
  { href: '/listings', label: 'Listings', icon: 'listings', permissions: ['listing:moderate'] },
  { href: '/users', label: 'Users', icon: 'users', permissions: ['user:manage'] },
  {
    href: '/businesses',
    label: 'Businesses',
    icon: 'building',
    permissions: ['business:verify'],
  },
  {
    href: '/businesses/claims',
    label: '',
    icon: 'shield',
    permissions: ['business:verify'],
  },
  {
    href: '/categories',
    label: 'Categories',
    icon: 'categories',
    permissions: ['category:manage'],
  },
  {
    href: '/data-health',
    label: 'Data health',
    icon: 'database',
    permissions: ['category:manage'],
  },
  { href: '/audit', label: 'Audit logs', icon: 'audit', permissions: ['audit:read'] },
  { href: '/system', label: 'System', icon: 'system', permissions: ['metrics:read', 'job:run'] },
];

function canSeeNavigationItem(user: DisplayUser, permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

/**
 * Console shell. The session check here is a redirect for convenience — the API
 * enforces permissions on every request, so a forged cookie buys nothing but an empty page.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const [user, { copy: queueCopy }] = await Promise.all([getCurrentUser(), getAdminQueueCopy()]);
  if (!user) redirect('/login');

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand-row">
          <div className="brand-mark" aria-hidden="true">
            L<span>Z</span>
          </div>
          <div>
            <div className="sidebar__brand">
              Loc<span>Z</span>
            </div>
            <span className="sidebar__tag">Operations centre</span>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Sections">
          {NAV.filter((item) => canSeeNavigationItem(user, item.permissions)).map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.href === '/businesses/claims' ? queueCopy.claimsNav : item.label}
              icon={item.icon}
            />
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <span className="sidebar__avatar" aria-hidden="true">
              {user.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{user.displayName}</strong>
              <small>{user.roles[0]?.toLowerCase().replace(/_/g, ' ') ?? 'team member'}</small>
            </span>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="sidebar__signout">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="workspace">
        <header className="workspace__bar">
          <div className="workspace__mobile-brand">LocZ operations</div>
          <div className="workspace__status">
            <span className="status-dot" aria-hidden="true" />
            Platform operational
          </div>
          <span className="workspace__date">
            {new Intl.DateTimeFormat('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            }).format(new Date())}
          </span>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
