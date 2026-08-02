'use server';

import { redirect } from 'next/navigation';
import { clearSession } from '../../lib/session';

/**
 * Signing out.
 *
 * clearSession has existed since sessions did, and until now nothing called it — a signed-in
 * person had no way to sign out anywhere in the app. On a shared or borrowed phone, which is
 * common, that is not an inconvenience: it means the next person to pick it up is signed in
 * as somebody else, able to read their chats and post in their name.
 *
 * A server action rather than a link, because the session cookie is httpOnly and only the
 * server can clear it. A POST rather than a GET so that a prefetch or a crawler cannot sign
 * somebody out by loading a page.
 */
export async function signOutAction(): Promise<never> {
  await clearSession();
  redirect('/');
}
