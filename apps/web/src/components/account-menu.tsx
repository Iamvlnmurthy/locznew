import Link from 'next/link';
import { signOutAction } from '../app/signout/actions';
import { Icon } from './icons';

export interface AccountMenuLabels {
  account: string;
  myAds: string;
  messages: string;
  saved: string;
  businesses: string;
  verifyPhone: string;
  location: string;
  signOut: string;
  signedInAs: string;
}

/**
 * Everything a signed-in person can reach.
 *
 * The header used to offer notifications and "my ads" and nothing else, while /chats,
 * /business, /location and /account/phone all existed and worked. Routes nobody can navigate
 * to are the same as routes that were never built — worse, because they look finished.
 *
 * Built on <details> rather than a click handler and state. It opens, closes and is keyboard
 * navigable before any JavaScript arrives, which matters on the cheap Android phones and thin
 * connections this platform is for: the menu is how somebody signs out, and a sign-out that
 * needs a hydrated bundle is a sign-out that fails exactly when the network is worst.
 */
export function AccountMenu({
  labels,
  displayName,
}: {
  labels: AccountMenuLabels;
  displayName: string;
}) {
  return (
    <details className="account-menu">
      <summary className="btn btn--ghost account-menu__trigger" aria-label={labels.account}>
        <Icon name="user" width="18" height="18" />
        <span className="account-menu__name">{displayName}</span>
      </summary>

      <div className="account-menu__panel">
        <p className="account-menu__who">
          <small>{labels.signedInAs}</small>
          <strong>{displayName}</strong>
        </p>

        <nav className="account-menu__links">
          <Link href="/dashboard">{labels.myAds}</Link>
          <Link href="/chats">{labels.messages}</Link>
          <Link href="/dashboard?tab=saved">{labels.saved}</Link>
          <Link href="/business">{labels.businesses}</Link>
          <Link href="/account/phone">{labels.verifyPhone}</Link>
          <Link href="/location">{labels.location}</Link>
        </nav>

        {/* A form, so signing out works with JavaScript disabled and cannot be triggered by
            a link prefetch. */}
        <form action={signOutAction} className="account-menu__signout">
          <button type="submit">{labels.signOut}</button>
        </form>
      </div>
    </details>
  );
}
