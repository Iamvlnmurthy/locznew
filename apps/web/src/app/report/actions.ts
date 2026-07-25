'use server';

import { api } from '@/lib/api';

export interface ReportState {
  error?: string;
  sent?: boolean;
}

/**
 * Submits a report. The API rate-limits the reporter and refuses self-reports; this
 * action only shapes the payload and surfaces the outcome.
 */
export async function submitReportAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const targetType = String(formData.get('targetType') ?? '');
  const targetId = String(formData.get('targetId') ?? '');
  const reason = String(formData.get('reason') ?? '');
  const details = String(formData.get('details') ?? '').trim();

  if (!targetId || !reason) return { error: 'Choose a reason' };

  try {
    await api('/reports', {
      method: 'POST',
      auth: true,
      body: { targetType, targetId, reason, ...(details ? { details } : {}) },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not send your report' };
  }

  return { sent: true };
}
