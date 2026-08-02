-- Lets somebody recover a forgotten password.
--
-- Nothing did before this: a forgotten password meant a lost account, its listings and its
-- conversations, with no route back in.
--
-- The token is never stored, only a SHA-256 of it. A reset table in a leaked backup would
-- otherwise be a list of working keys to every account that had recently asked for one.
-- SHA-256 rather than Argon2 on purpose: a 32-byte random token has no guessable structure,
-- so slow hashing protects nothing and costs a request.
--
-- Consumed rather than deleted, so a second attempt with the same link can be distinguished
-- from one that never existed -- and so the row survives long enough to be useful in support.

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedIp" VARCHAR(64),

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_createdAt_idx" ON "password_reset_tokens"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
