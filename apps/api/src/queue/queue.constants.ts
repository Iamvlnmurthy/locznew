/**
 * Queue and job names. Centralised because producers and consumers live in different
 * modules — a typo in a string literal would otherwise silently drop work.
 */
export const QUEUE_SEARCH = 'search';
export const QUEUE_NOTIFICATIONS = 'notifications';
export const QUEUE_LIFECYCLE = 'lifecycle';
export const QUEUE_SAVED_SEARCHES = 'saved-searches';
export const QUEUE_REQUIREMENTS = 'requirements';

export const JOB_INDEX_LISTING = 'index-listing';
export const JOB_REMOVE_LISTING = 'remove-listing';
export const JOB_REINDEX_ALL = 'reindex-all';

export const JOB_SEND_NOTIFICATION = 'send-notification';

/**
 * Matching a newly published listing against saved searches.
 *
 * Its own queue rather than a job on an existing one, because the producers are listings and
 * moderation while the consumer needs the saved-search service, which in turn asks listings
 * whether a listing matches. Going through a queue keeps that from becoming a ring of
 * modules holding references to each other, and it keeps the work off the request: a seller
 * pressing Post should not wait while every watcher in the city is evaluated.
 */
export const JOB_MATCH_SAVED_SEARCHES = 'match-saved-searches';

export interface MatchSavedSearchesJob {
  listingId: string;
}

/** Telling nearby sellers that a buyer wants something they deal in. */
export const JOB_MATCH_REQUIREMENT_SELLERS = 'match-requirement-sellers';

export interface MatchRequirementJob {
  listingId: string;
}

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
