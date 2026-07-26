/**
 * Queue and job names. Centralised because producers and consumers live in different
 * modules — a typo in a string literal would otherwise silently drop work.
 */
export const QUEUE_SEARCH = 'search';
export const QUEUE_NOTIFICATIONS = 'notifications';
export const QUEUE_LIFECYCLE = 'lifecycle';

export const JOB_INDEX_LISTING = 'index-listing';
export const JOB_REMOVE_LISTING = 'remove-listing';
export const JOB_REINDEX_ALL = 'reindex-all';

export const JOB_SEND_NOTIFICATION = 'send-notification';

export const JOB_EXPIRE_LISTINGS = 'expire-listings';
export const JOB_WARN_EXPIRING = 'warn-expiring';
export const JOB_SWEEP_ORPHAN_MEDIA = 'sweep-orphan-media';
export const JOB_SWEEP_SESSIONS = 'sweep-sessions';
export const JOB_TRIM_RECENTLY_VIEWED = 'trim-recently-viewed';
export const JOB_LIFT_EXPIRED_SUSPENSIONS = 'lift-expired-suspensions';

/** The job payload carries only an id — the worker re-reads current state (ADR-0005). */
export interface IndexListingJob {
  listingId: string;
}

export interface RemoveListingJob {
  listingId: string;
}

export interface SendNotificationJob {
  notificationId: string;
}
