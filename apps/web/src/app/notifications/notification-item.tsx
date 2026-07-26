import Link from 'next/link';
import { Icon } from '@/components/icons';
import type { Locale } from '@/i18n';
import { markReadAndOpenAction } from './actions';
import type { Notification, NotificationType } from './types';

const ICONS: Record<NotificationType, string> = {
  LISTING_APPROVED: 'check',
  LISTING_REJECTED: 'shield',
  LISTING_EXPIRING: 'calendar',
  LISTING_EXPIRED: 'calendar',
  NEW_ENQUIRY: 'message',
  NEW_MESSAGE: 'message',
  SAVED_SEARCH_MATCH: 'search',
  NEARBY_OFFER: 'tag',
  JOB_ENQUIRY: 'briefcase',
  BUSINESS_VERIFICATION_UPDATE: 'store',
  REPORT_RESOLUTION: 'shield',
  SECURITY_ALERT: 'shield',
};

function destinationFor(notification: Notification): string {
  const route = notification.data.route;
  if (typeof route === 'string' && route.startsWith('/') && !route.startsWith('//')) {
    if (route.startsWith('/listings/')) return '/dashboard?tab=listings';
    return route;
  }
  if (
    notification.data.entityType === 'Conversation' &&
    typeof notification.data.entityId === 'string'
  ) {
    return `/chats/${notification.data.entityId}`;
  }
  return '/dashboard';
}

export function NotificationItem({
  notification,
  labels,
  locale,
}: {
  notification: Notification;
  labels: Record<string, string>;
  locale: Locale;
}) {
  const destination = destinationFor(notification);
  const content = (
    <>
      <span
        className={`notification-item__icon notification-item__icon--${notification.type.toLowerCase()}`}
      >
        <Icon name={ICONS[notification.type]} />
      </span>
      <span className="notification-item__copy">
        <span className="notification-item__eyebrow">
          {labelForType(notification.type, labels)}
          {!notification.readAt ? <i>{labels.new}</i> : null}
        </span>
        <strong>{notification.title}</strong>
        <span>{notification.body}</span>
        <time dateTime={notification.createdAt}>
          {relativeTime(notification.createdAt, labels, locale)}
        </time>
      </span>
      <span className="notification-item__arrow" aria-hidden="true">
        <Icon name="arrow" />
      </span>
    </>
  );

  if (notification.readAt) {
    return (
      <Link href={destination} className="notification-item">
        {content}
      </Link>
    );
  }

  return (
    <form action={markReadAndOpenAction.bind(null, notification.id, destination)}>
      <button type="submit" className="notification-item is-unread">
        {content}
      </button>
    </form>
  );
}

export function labelForType(type: NotificationType, labels: Record<string, string>): string {
  const keys: Record<NotificationType, string> = {
    LISTING_APPROVED: 'typeListingApproved',
    LISTING_REJECTED: 'typeListingReview',
    LISTING_EXPIRING: 'typeListingReminder',
    LISTING_EXPIRED: 'typeListingExpired',
    NEW_ENQUIRY: 'typeNewEnquiry',
    NEW_MESSAGE: 'typeMessage',
    SAVED_SEARCH_MATCH: 'typeSavedSearch',
    NEARBY_OFFER: 'typeNearbyOffer',
    JOB_ENQUIRY: 'typeJobEnquiry',
    BUSINESS_VERIFICATION_UPDATE: 'typeBusinessUpdate',
    REPORT_RESOLUTION: 'typeSafetyUpdate',
    SECURITY_ALERT: 'typeSecurity',
  };
  return labels[keys[type]] ?? type;
}

function relativeTime(value: string, labels: Record<string, string>, locale: Locale): string {
  const timestamp = new Date(value).getTime();
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return labels.justNow;
  if (elapsedMinutes < 60) return labels.minutesAgo.replace('{count}', String(elapsedMinutes));
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return labels.hoursAgo.replace('{count}', String(elapsedHours));
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return labels.daysAgo.replace('{count}', String(elapsedDays));
  return new Date(value).toLocaleDateString(`${locale}-IN`, {
    day: 'numeric',
    month: 'short',
  });
}
