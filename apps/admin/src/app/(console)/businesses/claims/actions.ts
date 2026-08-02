'use server';

import { revalidatePath } from 'next/cache';
import { ApiRequestError, api } from '@/lib/api';

export interface ClaimDecisionState {
  error?: string;
  message?: string;
}
export interface ClaimActionCopy {
  missingClaim: string;
  reasonShort: string;
  approveError: string;
  rejectError: string;
  approved: string;
  rejected: string;
}

export async function decideClaimAction(
  copy: ClaimActionCopy,
  _previous: ClaimDecisionState,
  formData: FormData,
): Promise<ClaimDecisionState> {
  const claimId = String(formData.get('claimId') ?? '');
  const intent = String(formData.get('intent') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!claimId) return { error: copy.missingClaim };
  if (intent === 'reject' && reason.length < 5) return { error: copy.reasonShort };

  try {
    await api(`/businesses/claims/${claimId}/${intent === 'reject' ? 'reject' : 'approve'}`, {
      method: 'POST',
      body: intent === 'reject' ? { reason } : undefined,
    });
    revalidatePath('/businesses/claims');
    revalidatePath('/businesses');
    return { message: intent === 'reject' ? copy.rejected : copy.approved };
  } catch (error) {
    return {
      error:
        error instanceof ApiRequestError
          ? error.message
          : intent === 'reject'
            ? copy.rejectError
            : copy.approveError,
    };
  }
}
