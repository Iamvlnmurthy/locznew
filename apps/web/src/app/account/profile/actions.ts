'use server';

import { revalidatePath } from 'next/cache';
import { api } from '../../../lib/api';

export interface ProfileState {
  status: 'idle' | 'saved' | 'error';
  error?: string;
  values?: { displayName?: string; email?: string; bio?: string };
}

/**
 * Saving your own details.
 *
 * Everything typed is echoed back on failure, so a rejected email does not also cost somebody
 * the bio they just wrote.
 */
export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const displayName = String(formData.get('displayName') ?? '').trim();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const bio = String(formData.get('bio') ?? '').trim();

  const values = { displayName, email, bio };

  if (displayName.length < 2) return { status: 'error', error: 'invalidName', values };
  if (email && (!email.includes('@') || email.length < 5)) {
    return { status: 'error', error: 'invalidEmail', values };
  }

  try {
    await api('/users/me', { method: 'PATCH', body: { displayName, email, bio } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    // Worth naming: the address is how they sign in, so a clash is something to act on.
    if (/already/i.test(message)) return { status: 'error', error: 'emailTaken', values };
    return { status: 'error', error: 'failed', values };
  }

  // The header shows the display name, so a stale cache would leave the old one visible
  // everywhere and make the save look like it silently failed.
  revalidatePath('/', 'layout');
  return { status: 'saved', values };
}
