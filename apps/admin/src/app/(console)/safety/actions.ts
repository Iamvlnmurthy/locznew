'use server';

import { revalidatePath } from 'next/cache';
import { ApiRequestError, api } from '@/lib/api';

export interface SafetyActionState {
  error?: string;
  message?: string;
  preview?: { url: string; expiresInSeconds: number };
}

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

function actionError(error: unknown, fallback: string): SafetyActionState {
  return { error: error instanceof ApiRequestError ? error.message : fallback };
}

function refreshCase(caseId: string): void {
  revalidatePath('/safety');
  revalidatePath(`/safety/${caseId}`);
}

export async function reportSafetyCaseAction(
  _previous: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const caseId = value(formData, 'caseId');
  const reportReference = value(formData, 'reportReference');
  const justification = value(formData, 'justification');

  if (!caseId) return { error: 'Missing case identifier' };
  if (reportReference.length < 5) return { error: 'Enter the reporting acknowledgement' };
  if (justification.length < 15) return { error: 'Explain how and where the report was made' };

  try {
    await api(`/moderation/safety/cases/${caseId}/report`, {
      method: 'POST',
      body: { reportReference, justification },
    });
  } catch (error) {
    return actionError(error, 'Could not record the report');
  }

  refreshCase(caseId);
  return { message: 'External report recorded' };
}

export async function releaseSafetyCaseAction(
  _previous: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const caseId = value(formData, 'caseId');
  const justification = value(formData, 'justification');

  if (!caseId) return { error: 'Missing case identifier' };
  if (justification.length < 15) return { error: 'Record why the match is a false positive' };

  try {
    await api(`/moderation/safety/cases/${caseId}/release`, {
      method: 'POST',
      body: { justification },
    });
  } catch (error) {
    return actionError(error, 'Could not release the hold');
  }

  refreshCase(caseId);
  return { message: 'Hold released to ordinary human review' };
}

export async function closeSafetyCaseAction(
  _previous: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const caseId = value(formData, 'caseId');
  const justification = value(formData, 'justification');

  if (!caseId) return { error: 'Missing case identifier' };
  if (justification.length < 15) return { error: 'Record why active handling is complete' };

  try {
    await api(`/moderation/safety/cases/${caseId}/close`, {
      method: 'POST',
      body: { justification },
    });
  } catch (error) {
    return actionError(error, 'Could not close the case');
  }

  refreshCase(caseId);
  return { message: 'Case closed; legal hold preserved' };
}

export async function requestEvidencePreviewAction(
  _previous: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const caseId = value(formData, 'caseId');
  const justification = value(formData, 'justification');

  if (!caseId) return { error: 'Missing case identifier' };
  if (justification.length < 15) {
    return { error: 'Explain why viewing the evidence is necessary' };
  }

  try {
    const preview = await api<{ url: string; expiresInSeconds: number }>(
      `/moderation/safety/cases/${caseId}/evidence-preview`,
      { method: 'POST', body: { justification } },
    );
    revalidatePath(`/safety/${caseId}`);
    return { message: 'Audited preview ready', preview };
  } catch (error) {
    return actionError(error, 'Could not prepare the evidence preview');
  }
}
