-- Load-aware job queue for VPS batch work (transliteration, section refinement, news pulls…).
-- One runner drains it, one job at a time, only when system load has headroom — so background
-- work can never again overload the box and crash Postgres (the 24 Aug incident).
CREATE TABLE IF NOT EXISTS job_queue (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL,                 -- 'translit' | 'refine' | 'news-pull' | …
  command     text NOT NULL,                 -- shell command the runner executes
  priority    int  NOT NULL DEFAULT 100,     -- lower runs first
  status      text NOT NULL DEFAULT 'queued',-- queued | running | done | failed | canceled
  attempts    int  NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 1,
  log_tail    text,                          -- last lines of output for quick inspection
  enqueued_by text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS job_queue_pick ON job_queue (status, priority, id);
