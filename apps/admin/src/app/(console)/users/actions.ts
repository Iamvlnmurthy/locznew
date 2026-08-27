'use server';

import { revalidatePath } from 'next/cache';
import { ApiRequestError, api } from '@/lib/api';

export interface UserActionState {
  error?: string;
  message?: string;
}

export async function suspendUserAction(
  userId: string,
  reason: string,
  durationDays?: number,
): Promise<UserActionState> {
  if (!userId) return { error: 'Missing user ID' };
  if (!reason || reason.trim().length < 3)
    return { error: 'Please enter a valid suspension reason' };

  try {
    await api(`/moderation/users/${userId}/suspend`, {
      method: 'POST',
      body: { reason: reason.trim(), durationDays },
    });
    revalidatePath('/users');
    return { message: 'Account suspended successfully.' };
  } catch (error) {
    return {
      error: error instanceof ApiRequestError ? error.message : 'Could not suspend user.',
    };
  }
}

export async function reinstateUserAction(
  userId: string,
  reason = 'Admin reinstatement',
): Promise<UserActionState> {
  if (!userId) return { error: 'Missing user ID' };

  try {
    await api(`/moderation/users/${userId}/reinstate`, {
      method: 'POST',
      body: { reason },
    });
    revalidatePath('/users');
    return { message: 'Account reinstated successfully.' };
  } catch (error) {
    return {
      error: error instanceof ApiRequestError ? error.message : 'Could not reinstate user.',
    };
  }
}
