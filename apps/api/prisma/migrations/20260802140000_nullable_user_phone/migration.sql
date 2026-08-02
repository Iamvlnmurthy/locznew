-- Google sign-up creates an account from a verified Google email, which carries no phone
-- number. Before this, `users.phoneE164` was NOT NULL, so Google could only ever link to an
-- account somebody had already created with a number — making the sign-up page's Google
-- button a dead end that told people to fill in the form instead.
--
-- The unique index is kept exactly as it was. Postgres allows any number of NULLs under a
-- unique index, so it goes on doing the only job that matters here: stopping two accounts
-- from claiming the same number. Nothing is backfilled and no existing row changes.
ALTER TABLE "users" ALTER COLUMN "phoneE164" DROP NOT NULL;
