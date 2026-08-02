'use server';

import { api } from '../../../lib/api';

export interface ConfirmPhoneState {
  status: 'idle' | 'confirmed' | 'error';
  phone?: string;
  error?: string;
}

/**
 * Hands the Firebase assertion to the API, which is the only thing that may believe it.
 *
 * Deliberately a server action rather than a fetch from the component: the LocZ session lives
 * in an httpOnly cookie the browser cannot read, and this endpoint needs it. Doing the call
 * here also means the Firebase token never has to be held anywhere but the one request that
 * spends it.
 */
export async function confirmPhoneAction(idToken: string): Promise<ConfirmPhoneState> {
  try {
    const result = await api<{ phoneE164: string }>('/auth/phone/confirm', {
      method: 'POST',
      body: { idToken },
    });

    return { status: 'confirmed', phone: result.phoneE164 };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    // The one failure worth naming. Numbers are unique and are how a buyer reaches a seller,
    // so this is a real conflict the person has to resolve, not a retry.
    if (/already on another/i.test(message)) {
      return { status: 'error', error: 'alreadyTaken' };
    }

    return { status: 'error', error: 'failed' };
  }
}
