/**
 * Test environment. Loaded via jest `setupFiles`, which runs before any module import —
 * ConfigModule.forRoot() validates the environment at import time, so setting these
 * inside a test body would already be too late.
 *
 * These are throwaway values for a process that never reaches a real service.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://locz:locz@localhost:5432/locz_test?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-long-enough-to-pass';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-long-enough-to-pass';
process.env.OTP_PROVIDER ??= 'mock';
process.env.LOG_LEVEL ??= 'error';
// No repeatable jobs, and therefore no live Redis connection, during a test run.
process.env.SCHEDULER_ENABLED ??= 'false';
