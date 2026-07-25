import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { logoutAction } from '../login/actions';
import { NavLink } from './nav-link';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/moderation', label: 'Moderation queue' },
  { href: '/listings', label: 'Listings' },
  { href: '/users', label: 'Users' },
  { href: '/categories', label: 'Categories' },
  { href: '/system', label: 'System' },
];

/**
 * Console shell. The session check here is a redirect for convenience — the API
 * enforces permissions on every request, so a forged cookie buys nothing but an empty page.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <div className="sidebar__brand">
            Loc<span>Z</span>
          </div>
          <span className="sidebar__tag">Admin console</span>
        </div>

        <nav className="sidebar__nav" aria-label="Sections">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>

        <div className="sidebar__footer">
          <div style={{ fontWeight: 600, color: 'var(--locz-text)' }}>{user.displayName}</div>
          <div style={{ marginBottom: 12 }}>
            {user.roles.join(', ').toLowerCase().replace(/_/g, ' ')}
          </div>
          <form action={logoutAction}>
            <button type="submit" className="btn btn--ghost" style={{ width: '100%' }}>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
