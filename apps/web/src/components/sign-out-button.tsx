import { signOutAction } from '../app/signout/actions';

/**
 * The way out. Plain form and server action, so it works before JavaScript loads and on a
 * browser where it never does.
 */
export function SignOutButton({ label }: { label: string }) {
  return (
    <form action={signOutAction}>
      <button type="submit" className="btn btn--ghost">
        {label}
      </button>
    </form>
  );
}
