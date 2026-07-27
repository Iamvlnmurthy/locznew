import { z } from 'zod';

/**
 * Environment contract. The API refuses to boot if this fails — a missing secret
 * must surface at startup, never as a 500 in production traffic.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true' || value === '1');

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TZ: z.string().default('Asia/Kolkata'),

  API_PORT: z.coerce.number().int().positive().default(4000),
  API_GLOBAL_PREFIX: z.string().default('api'),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: csv,

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),

  OTP_PROVIDER: z.enum(['mock', 'msg91', 'twilio', 'pin']).default('mock'),
  /**
   * A shared PIN used in place of a one-time code, for a closed trial with no SMS gateway.
   * Digits only, and its length must match OTP_LENGTH so the generated code and the PIN are
   * the same shape. Never permitted in production — see the guard below.
   */
  OTP_FIXED_CODE: z
    .string()
    .regex(/^\d{4,8}$/, 'OTP_FIXED_CODE must be 4 to 8 digits')
    .optional(),
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_REQUESTS_PER_PHONE_PER_WINDOW: z.coerce.number().int().positive().default(3),
  OTP_REQUEST_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_MAX_VERIFY_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_LOCKOUT_SECONDS: z.coerce.number().int().positive().default(900),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_API_KEY_SID: z.string().optional(),
  TWILIO_API_KEY_SECRET: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  STORAGE_ENDPOINT: z.string().url().default('http://localhost:9000'),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_BUCKET: z.string().default('locz-media'),
  STORAGE_ACCESS_KEY_ID: z.string().default(''),
  STORAGE_SECRET_ACCESS_KEY: z.string().default(''),
  STORAGE_FORCE_PATH_STYLE: booleanish.default(true),
  STORAGE_PUBLIC_BASE_URL: z.string().url().default('http://localhost:9000/locz-media'),
  STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  MEDIA_MAX_FILE_SIZE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  MEDIA_ALLOWED_MIME: csv,
  MEDIA_MAX_IMAGES_PER_LISTING: z.coerce.number().int().positive().default(12),
  IMAGE_SCANNER_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(5_000),
  IMAGE_SCANNER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  IMAGE_SCANNER_PROVIDER: z.enum(['quarantine', 'rekognition']).default('quarantine'),
  AWS_REKOGNITION_REGION: z.string().default('ap-south-1'),
  AWS_REKOGNITION_ACCESS_KEY_ID: z.string().optional(),
  AWS_REKOGNITION_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REKOGNITION_MIN_CONFIDENCE: z.coerce.number().min(50).max(100).default(50),
  AWS_REKOGNITION_REVIEW_CONFIDENCE: z.coerce.number().min(50).max(100).default(60),
  AWS_REKOGNITION_REJECT_CONFIDENCE: z.coerce.number().min(50).max(100).default(90),
  PROTECTED_HASH_PROVIDER: z.enum(['unconfigured']).default('unconfigured'),
  PROTECTED_HASH_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(5_000),
  PROTECTED_HASH_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),

  MEILI_HOST: z.string().url().default('http://localhost:7700'),
  MEILI_MASTER_KEY: z.string().default(''),
  MEILI_LISTINGS_INDEX: z.string().default('listings'),

  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default('development'),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Registers the repeatable BullMQ jobs. Should be true on exactly one deployment —
   * normally the worker — so several API replicas do not each re-register the schedule.
   * Forced off under NODE_ENV=test so a test run never talks to a real queue.
   */
  SCHEDULER_ENABLED: booleanish.default(true),

  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Nest's ConfigModule calls this with `process.env`. Throwing here aborts the boot.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const configured = (value: string | undefined): boolean => Boolean(value?.trim());
  const requireKeys = (provider: string, keys: (keyof Env)[]): void => {
    const missing = keys.filter((key) => !configured(result.data[key] as string | undefined));
    if (missing.length > 0) {
      throw new Error(
        `${provider} is selected but required configuration is missing: ${missing.join(', ')}`,
      );
    }
  };

  if (result.data.OTP_PROVIDER === 'msg91') {
    requireKeys('OTP_PROVIDER=msg91', ['MSG91_AUTH_KEY', 'MSG91_SENDER_ID', 'MSG91_TEMPLATE_ID']);
  }

  if (result.data.OTP_PROVIDER === 'twilio') {
    requireKeys('OTP_PROVIDER=twilio', ['TWILIO_ACCOUNT_SID', 'TWILIO_FROM_NUMBER']);
    const hasApiKey =
      configured(result.data.TWILIO_API_KEY_SID) && configured(result.data.TWILIO_API_KEY_SECRET);
    const hasAuthToken = configured(result.data.TWILIO_AUTH_TOKEN);
    if (!hasApiKey && !hasAuthToken) {
      throw new Error(
        'OTP_PROVIDER=twilio requires TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET, or TWILIO_AUTH_TOKEN',
      );
    }
  }

  const fcmKeys: (keyof Env)[] = ['FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL', 'FCM_PRIVATE_KEY'];
  const configuredFcm = fcmKeys.filter((key) => configured(result.data[key] as string | undefined));
  if (configuredFcm.length > 0 && configuredFcm.length !== fcmKeys.length) {
    throw new Error('FCM configuration is partial; set all three FCM variables or none');
  }

  const hasRekognitionAccessKey = configured(result.data.AWS_REKOGNITION_ACCESS_KEY_ID);
  const hasRekognitionSecret = configured(result.data.AWS_REKOGNITION_SECRET_ACCESS_KEY);
  if (hasRekognitionAccessKey !== hasRekognitionSecret) {
    throw new Error(
      'AWS Rekognition credentials are partial; set both access-key variables or neither',
    );
  }
  if (
    result.data.AWS_REKOGNITION_MIN_CONFIDENCE > result.data.AWS_REKOGNITION_REVIEW_CONFIDENCE ||
    result.data.AWS_REKOGNITION_REVIEW_CONFIDENCE > result.data.AWS_REKOGNITION_REJECT_CONFIDENCE
  ) {
    throw new Error('AWS Rekognition confidence values must satisfy min <= review <= reject');
  }

  // Development convenience must never leak into production.
  if (result.data.NODE_ENV === 'production' && result.data.OTP_PROVIDER === 'mock') {
    throw new Error('OTP_PROVIDER=mock is not permitted when NODE_ENV=production');
  }

  // A shared PIN is one credential for every account. It exists so a closed trial can be
  // used without an SMS gateway; letting it reach real users would mean anybody who learned
  // four digits could sign in as anybody.
  if (result.data.NODE_ENV === 'production' && result.data.OTP_PROVIDER === 'pin') {
    throw new Error('OTP_PROVIDER=pin is not permitted when NODE_ENV=production');
  }
  if (result.data.OTP_PROVIDER === 'pin' && !result.data.OTP_FIXED_CODE) {
    throw new Error('OTP_PROVIDER=pin requires OTP_FIXED_CODE');
  }
  if (result.data.OTP_FIXED_CODE && result.data.OTP_FIXED_CODE.length !== result.data.OTP_LENGTH) {
    throw new Error(
      `OTP_FIXED_CODE is ${result.data.OTP_FIXED_CODE.length} digits but OTP_LENGTH is ` +
        `${result.data.OTP_LENGTH}; they must match or the PIN can never be entered`,
    );
  }

  return result.data;
}
