-- gazetteer.service.ts's resolve() queries `WHERE lower("name") IN (...)` on every news article
-- (its own docstring claims this is "an INDEXED DB lookup"), but no index on lower(name) ever
-- existed -- confirmed live: 236,483 sequential scans reading 57.6 billion rows total against a
-- table of only 244,025 rows. A plain index on "name" can't serve a lower() filter; this needs a
-- functional index on the expression itself. The table is small (244k rows), so this is fast.
CREATE INDEX IF NOT EXISTS "localities_lower_name_idx" ON "localities" (lower("name"));
