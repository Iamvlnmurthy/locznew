-- Distinct voters for an area correction.
--
-- Two corrections near the same point override the pincode shown to everyone standing there.
-- That threshold was counting rows, and the endpoint is open to anonymous callers, so one
-- person submitting the same correction twice satisfied a rule written to mean "two people who
-- were both there agreed". Recording who submitted each one makes the count distinct over
-- people rather than over requests.
--
-- Nullable and backfilled to NULL on purpose: existing rows have no submitter recorded, and
-- inventing one would manufacture agreement that was never observed. The vote query ignores
-- rows where both identifiers are null, so historical corrections stop voting rather than
-- voting for an unknown number of people.
ALTER TABLE "area_corrections" ADD COLUMN "submittedIp" VARCHAR(64);

CREATE INDEX "area_corrections_chosenCode_userId_submittedIp_idx"
  ON "area_corrections" ("chosenCode", "userId", "submittedIp");
