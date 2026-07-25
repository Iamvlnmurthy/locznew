import { z } from 'zod';

/**
 * Validation schemas shared by the API and the frontends.
 *
 * The API validates every request regardless — these exist so a form can reject bad
 * input before a round trip, using **exactly** the same rules. Where the two disagree,
 * the API wins; that is why the constants live here and both sides import them rather
 * than each restating the limits.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Ten digits starting 6–9 — the Indian mobile range. */
export const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
export const E164_INDIA_REGEX = /^\+91[6-9]\d{9}$/;

export const indianMobile = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .transform((value) => (value.startsWith('91') && value.length === 12 ? value.slice(2) : value))
  .refine((value) => INDIAN_MOBILE_REGEX.test(value), {
    message: 'Enter a valid 10-digit mobile number',
  });

export const toE164 = (national: string): string => `+91${national}`;

export const uuid = z.string().uuid({ message: 'Invalid identifier' });

export const otpCode = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, { message: 'Enter the code we sent you' });

/** Latitude and longitude bounds wide enough for India plus a margin. */
export const latitude = z.coerce.number().min(-90).max(90);
export const longitude = z.coerce.number().min(-180).max(180);

export const RADIUS_PRESETS_KM = [1, 3, 5, 10, 25, 50] as const;
export const radiusKm = z.coerce
  .number()
  .refine((value) => (RADIUS_PRESETS_KM as readonly number[]).includes(value), {
    message: `Choose one of ${RADIUS_PRESETS_KM.join(', ')} km`,
  });

// ---------------------------------------------------------------------------
// Limits — the single source for both client hints and server rules
// ---------------------------------------------------------------------------

export const LIMITS = {
  listingTitle: { min: 5, max: 160 },
  listingDescription: { min: 10, max: 5000 },
  price: { min: 0, max: 100_000_000 },
  imagesPerListing: 12,
  imageBytes: 10 * 1024 * 1024,
  messageBody: { min: 1, max: 2000 },
  reportDetails: 1000,
  businessName: { min: 2, max: 180 },
} as const;

export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const requestOtpSchema = z.object({ phone: indianMobile });

export const verifyOtpSchema = z.object({
  phone: indianMobile,
  code: otpCode,
});

export const emailLoginSchema = z.object({
  email: z.string().trim().email({ message: 'Enter a valid email address' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }).max(128),
});

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export const listingTitle = z
  .string()
  .trim()
  .min(LIMITS.listingTitle.min, { message: 'Give your ad a clearer title' })
  .max(LIMITS.listingTitle.max);

export const listingDescription = z
  .string()
  .trim()
  .min(LIMITS.listingDescription.min, {
    message: 'Add a short description so buyers know what this is',
  })
  .max(LIMITS.listingDescription.max);

export const priceSchema = z.coerce
  .number()
  .min(LIMITS.price.min, { message: 'Price cannot be negative' })
  .max(LIMITS.price.max, { message: 'That price is not plausible' });

export const marketplaceDetailsSchema = z
  .object({
    price: priceSchema.optional(),
    isFree: z.boolean().default(false),
    isNegotiable: z.boolean().default(false),
    condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'FOR_PARTS']),
    brand: z.string().trim().max(120).optional(),
    model: z.string().trim().max(120).optional(),
  })
  .refine((value) => value.isFree || value.price !== undefined, {
    message: 'Enter a price, or tick "giving this away free"',
    path: ['price'],
  });

export const createListingSchema = z.object({
  type: z.enum([
    'CLASSIFIED',
    'PRODUCT',
    'BUYER_REQUIREMENT',
    'OFFER',
    'JOB',
    'SERVICE',
    'RENTAL',
    'EVENT',
    'BUSINESS_LISTING',
  ]),
  title: listingTitle,
  description: listingDescription,
  categoryId: uuid,
  cityId: uuid,
  localityId: uuid.optional(),
  contactPreference: z
    .enum(['IN_APP_ONLY', 'PHONE', 'WHATSAPP', 'EMAIL', 'PHONE_AND_IN_APP'])
    .default('IN_APP_ONLY'),
  marketplace: marketplaceDetailsSchema.optional(),
});

export const jobDetailsSchema = z
  .object({
    companyName: z.string().trim().min(2).max(180),
    employmentType: z.enum([
      'FULL_TIME',
      'PART_TIME',
      'CONTRACT',
      'INTERNSHIP',
      'FREELANCE',
      'TEMPORARY',
      'DAILY_WAGE',
    ]),
    workplaceType: z.enum(['ON_SITE', 'HYBRID', 'REMOTE']),
    salaryMin: z.coerce.number().min(0).optional(),
    salaryMax: z.coerce.number().min(0).optional(),
    applyMethod: z.enum(['IN_APP', 'EXTERNAL_LINK', 'WALK_IN', 'PHONE']),
    externalApplyUrl: z.string().url().optional(),
  })
  .refine(
    (value) =>
      value.salaryMin === undefined ||
      value.salaryMax === undefined ||
      value.salaryMin <= value.salaryMax,
    { message: 'The minimum salary cannot be above the maximum', path: ['salaryMax'] },
  )
  .refine((value) => value.applyMethod !== 'EXTERNAL_LINK' || Boolean(value.externalApplyUrl), {
    message: 'Provide the application link',
    path: ['externalApplyUrl'],
  });

export const offerDetailsSchema = z
  .object({
    originalPrice: z.coerce.number().min(0).optional(),
    offerPrice: z.coerce.number().min(0).optional(),
    couponCode: z.string().trim().max(40).optional(),
    startsAt: z.string().datetime({ message: 'Enter a valid start date' }),
    endsAt: z.string().datetime({ message: 'Enter a valid end date' }),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: 'The offer must end after it starts',
    path: ['endsAt'],
  })
  .refine(
    (value) =>
      value.originalPrice === undefined ||
      value.offerPrice === undefined ||
      value.offerPrice <= value.originalPrice,
    { message: 'The offer price must be below the original price', path: ['offerPrice'] },
  );

// ---------------------------------------------------------------------------
// Other
// ---------------------------------------------------------------------------

export const enquirySchema = z.object({
  listingId: uuid,
  message: z
    .string()
    .trim()
    .min(LIMITS.messageBody.min, { message: 'Write a short message first' })
    .max(LIMITS.messageBody.max),
});

export const reportSchema = z.object({
  targetType: z.enum(['LISTING', 'BUSINESS', 'USER', 'MESSAGE']),
  targetId: uuid,
  reason: z.enum([
    'SPAM',
    'FRAUD_OR_SCAM',
    'PROHIBITED_ITEM',
    'DUPLICATE',
    'WRONG_CATEGORY',
    'OFFENSIVE_CONTENT',
    'MISLEADING_PRICE',
    'ALREADY_SOLD',
    'HARASSMENT',
    'OTHER',
  ]),
  details: z.string().trim().max(LIMITS.reportDetails).optional(),
});

export const imageUploadSchema = z.object({
  // Zod 4 replaced the `errorMap` callback with a plain `error` message or function.
  mimeType: z.enum(ALLOWED_IMAGE_MIME, {
    error: 'Upload a JPEG, PNG, WebP or HEIC image',
  }),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(LIMITS.imageBytes, { message: 'Image must be under 10 MB' }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Flattens a Zod error into `{ field: message }`, which is the shape a form needs.
 * Only the first error per field is kept — showing five messages under one input is
 * noise, not help.
 */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || '_';
    if (!(field in errors)) errors[field] = issue.message;
  }
  return errors;
}

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type EnquiryInput = z.infer<typeof enquirySchema>;
export type ReportInput = z.infer<typeof reportSchema>;
export { z };
