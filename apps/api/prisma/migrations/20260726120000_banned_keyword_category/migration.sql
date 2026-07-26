-- Why a term is banned, and what that rests on.
--
-- A moderator reviewing a queue needs to know whether a listing tripped a wildlife-trade
-- rule or a spam heuristic, and a seller appealing a rejection deserves better than "your
-- listing broke the rules". Both columns are nullable: the existing rows predate them, and
-- an operator adding a term in a hurry during an incident should not be blocked by
-- paperwork.
ALTER TABLE "banned_keywords" ADD COLUMN IF NOT EXISTS "category" VARCHAR(60);
ALTER TABLE "banned_keywords" ADD COLUMN IF NOT EXISTS "basis" VARCHAR(200);

-- The moderation queue groups by category when triaging a spike.
CREATE INDEX IF NOT EXISTS "banned_keywords_category_idx" ON "banned_keywords" ("category");
