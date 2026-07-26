export type NotificationChannel = 'IN_APP' | 'PUSH' | 'EMAIL' | 'SMS';

export type NotificationType =
  | 'LISTING_APPROVED'
  | 'LISTING_REJECTED'
  | 'LISTING_EXPIRING'
  | 'LISTING_EXPIRED'
  | 'NEW_ENQUIRY'
  | 'NEW_MESSAGE'
  | 'SAVED_SEARCH_MATCH'
  | 'NEARBY_OFFER'
  | 'JOB_ENQUIRY'
  | 'BUSINESS_VERIFICATION_UPDATE'
  | 'REPORT_RESOLUTION'
  | 'SECURITY_ALERT';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}
