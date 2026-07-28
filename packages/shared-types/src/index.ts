/**
 * Types shared by the LocZ web and admin applications.
 *
 * These mirror the API's Prisma enums and response envelope. They are written by hand
 * rather than generated because the frontends must not import `@prisma/client` — that
 * would pull the database layer into a browser bundle. The API's Swagger document is
 * the contract; this file is the browser-safe projection of it.
 */

// ---------------------------------------------------------------------------
// Enums — must stay in step with apps/api/prisma/schema.prisma
// ---------------------------------------------------------------------------

export const ListingType = {
  CLASSIFIED: 'CLASSIFIED',
  PRODUCT: 'PRODUCT',
  BUYER_REQUIREMENT: 'BUYER_REQUIREMENT',
  OFFER: 'OFFER',
  JOB: 'JOB',
  SERVICE: 'SERVICE',
  RENTAL: 'RENTAL',
  EVENT: 'EVENT',
  BUSINESS_LISTING: 'BUSINESS_LISTING',
} as const;
export type ListingType = (typeof ListingType)[keyof typeof ListingType];

export const ListingStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  PUBLISHED: 'PUBLISHED',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  SOLD: 'SOLD',
  FILLED: 'FILLED',
  EXPIRED: 'EXPIRED',
  ARCHIVED: 'ARCHIVED',
  REMOVED: 'REMOVED',
} as const;
export type ListingStatus = (typeof ListingStatus)[keyof typeof ListingStatus];

export const ItemCondition = {
  NEW: 'NEW',
  LIKE_NEW: 'LIKE_NEW',
  GOOD: 'GOOD',
  FAIR: 'FAIR',
  FOR_PARTS: 'FOR_PARTS',
} as const;
export type ItemCondition = (typeof ItemCondition)[keyof typeof ItemCondition];

export const RoleName = {
  GUEST: 'GUEST',
  REGISTERED_USER: 'REGISTERED_USER',
  INDIVIDUAL_SELLER: 'INDIVIDUAL_SELLER',
  BUSINESS_OWNER: 'BUSINESS_OWNER',
  EMPLOYER: 'EMPLOYER',
  SERVICE_PROVIDER: 'SERVICE_PROVIDER',
  MODERATOR: 'MODERATOR',
  ADMINISTRATOR: 'ADMINISTRATOR',
  SUPER_ADMINISTRATOR: 'SUPER_ADMINISTRATOR',
} as const;
export type RoleName = (typeof RoleName)[keyof typeof RoleName];

export const Language = { EN: 'EN', TE: 'TE', HI: 'HI' } as const;
export type Language = (typeof Language)[keyof typeof Language];

export const DevicePlatform = { ANDROID: 'ANDROID', IOS: 'IOS', WEB: 'WEB' } as const;
export type DevicePlatform = (typeof DevicePlatform)[keyof typeof DevicePlatform];

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  success: true;
  data: T;
  correlationId?: string;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: unknown };
  correlationId?: string;
  timestamp: string;
  path: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

// ---------------------------------------------------------------------------
// Domain payloads
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  phone: string;
  email?: string | null;
  displayName: string;
  preferredLanguage: Language;
  roles: RoleName[];
  permissions: string[];
  isNewUser: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresAt: string;
}

export interface AuthSession {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface ListingSummary {
  id: string;
  slug: string;
  type: ListingType;
  title: string;
  status: ListingStatus;
  price: number | null;
  isNegotiable: boolean;
  cityName: string;
  localityName: string | null;
  thumbUrl: string | null;
  isFeatured: boolean;
  viewCount: number;
  publishedAt: string | null;
  distanceMeters?: number;
  isSaved?: boolean;
}

export interface ModerationQueueItem {
  id: string;
  title: string;
  type: ListingType;
  ownerId: string;
  ownerName: string;
  ownerPublishedCount: number;
  cityName: string;
  categoryName: string;
  price: number | null;
  moderationScore: number | null;
  systemReasons: string[];
  imageCount: number;
  reportCount: number;
  createdAt: string;
}

export interface SearchIndexStatus {
  available: boolean;
  indexedDocuments?: number;
  publishedListings: number;
  drift: number;
}

export type CategoryAttributeDataType =
  'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT' | 'MULTI_SELECT' | 'DATE';

export interface CategoryAttributeOption {
  value: string;
  label: string;
  labelTe?: string | null;
  labelHi?: string | null;
}

export interface CategoryAttribute {
  id?: string;
  key: string;
  label: string;
  labelTe?: string | null;
  labelHi?: string | null;
  dataType: CategoryAttributeDataType;
  options?: CategoryAttributeOption[];
  unit?: string | null;
  isRequired: boolean;
  isFilterable: boolean;
  minValue?: number | null;
  maxValue?: number | null;
  sortOrder?: number;
}

export interface Category {
  id: string;
  name: string;
  nameTe: string | null;
  nameHi: string | null;
  slug: string;
  iconKey: string | null;
  listingTypes: ListingType[];
  parentId: string | null;
  sortOrder: number;
  attributes?: CategoryAttribute[];
  children?: Category[];
}

export interface City {
  id: string;
  name: string;
  slug: string;
  nameTe: string | null;
  nameHi: string | null;
  stateName: string;
  districtName: string | null;
  latitude: number;
  longitude: number;
  isLaunched: boolean;
  distanceMeters?: number;
}

/** Human labels for the machine reasons the moderation provider emits. */
export const MODERATION_REASON_LABELS: Record<string, string> = {
  NEW_ACCOUNT: 'First listings from this account',
  SHORTENED_URL: 'Shortened link',
  EXTERNAL_LINK: 'External link',
  MULTIPLE_PHONE_NUMBERS: 'Several phone numbers in the text',
  EMAIL_IN_BODY: 'Email address in the description',
  PAYMENT_UPFRONT_LANGUAGE: 'Asks for payment upfront',
  ALL_CAPS_TITLE: 'Title is all caps',
  EXCESSIVE_PUNCTUATION: 'Excessive punctuation',
  THIN_DESCRIPTION: 'Very short description',
  DUPLICATE_LISTING: 'Duplicate of an existing listing',
  SUSPICIOUS_PRICE: 'Implausible price',
};

export function moderationReasonLabel(reason: string): string {
  if (reason.startsWith('BANNED_KEYWORD:')) {
    return `Banned keyword: "${reason.slice('BANNED_KEYWORD:'.length)}"`;
  }
  return MODERATION_REASON_LABELS[reason] ?? reason;
}
