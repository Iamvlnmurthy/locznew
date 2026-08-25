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
// Argon2 with production cost (19 MiB, t=2) is fine in prod but, multiplied across Jest's parallel
// workers, starves CPU/memory and makes the password specs flaky (they time out and fail, yet pass
// in isolation). Tests do not need real hashing strength — argon2.verify reads the cost from the
// encoded hash, so hashing cheap here stays internally consistent. Prod keeps the real defaults.
process.env.ARGON2_MEMORY_COST ??= '512';
process.env.ARGON2_TIME_COST ??= '1';
