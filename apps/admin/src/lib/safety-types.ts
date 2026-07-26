export type SafetyCaseStatus = 'OPEN' | 'REPORTED' | 'RELEASED' | 'CLOSED';

export type SafetyAccessAction =
  'CASE_VIEWED' | 'EVIDENCE_PREVIEW' | 'CASE_REPORTED' | 'HOLD_RELEASED' | 'CASE_CLOSED';

export interface SafetyCaseSummary {
  id: string;
  mediaId: string;
  listingId: string;
  status: SafetyCaseStatus;
  reasonCode: string;
  openedAt: string;
}

export interface SafetyAccessEvent {
  id: string;
  actorId: string;
  action: SafetyAccessAction;
  justification: string;
  createdAt: string;
}

export interface SafetyCaseDetail {
  id: string;
  mediaId: string;
  listingId: string;
  status: SafetyCaseStatus;
  mediaStatus: string;
  provider: string;
  providerReference: string | null;
  reasonCode: string;
  reportReference: string | null;
  resolutionNote: string | null;
  openedAt: string;
  reportedAt: string | null;
  releasedAt: string | null;
  closedAt: string | null;
  accessHistory: SafetyAccessEvent[];
}
