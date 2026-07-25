'use server';

import { revalidatePath } from 'next/cache';
import { ApiRequestError, api } from '@/lib/api';

export interface ResolveReportState {
  error?: string;
  message?: string;
}

/**
 * Resolves or dismisses a report. Removing the listing is an explicit checkbox rather
 * than an automatic consequence — mass-reporting a competitor is itself an abuse pattern,
 * so the decision stays with the moderator.
 */
export async function resolveReportAction(
  _prev: ResolveReportState,
  formData: FormData,
): Promise<ResolveReportState> {
  const reportId = String(formData.get('reportId') ?? '');
  const status = String(formData.get('status') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  const removeListing = formData.get('removeListing') === 'on';

  if (!reportId) return { error: 'Missing report' };
  if (note.length < 3) return { error: 'Add a short note explaining the decision' };

  try {
    await api(`/reports/${reportId}/resolve`, {
      method: 'POST',
      body: { status, note, removeListing },
    });
  } catch (error) {
    return {
      error: error instanceof ApiRequestError ? error.message : 'Could not resolve the report',
    };
  }

  revalidatePath('/reports');
  revalidatePath('/');
  return { message: status === 'RESOLVED' ? 'Report resolved' : 'Report dismissed' };
}
