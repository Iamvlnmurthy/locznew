# LocZ VPS Job Queue (load-aware, single-runner)

Background batch work — transliteration, city-section refinement, news pulls — must never run all
at once on the 4-core VPS. On 24 Aug, six concurrent `nohup` jobs drove load to 10+ and crashed
Postgres into recovery, which crash-looped the api. This queue makes that impossible: **everything
is enqueued and drained one job at a time, only when the box has headroom.**

## Pieces

- `create_job_queue.sql` — the `job_queue` table (prod Postgres).
- `queue_runner.py` — the daemon (pm2 `locz-jobq`). Loop: check 1-min load-per-core + free RAM; if
  there's headroom, atomically claim the next job (lowest `priority`, then FIFO), run it under
  `nice -n15 ionice -c3` so it yields to api/web/DB, record result, cool down. **Concurrency = 1.**
  Gates: `MAX_LOAD_PER_CORE` (1.3), `MIN_FREE_MB` (500), `POLL_SECS` (20), `COOLDOWN_SECS` (10).
- `jobq.py` — CLI: `add --kind K --cmd "…" [--priority N]`, `list`, `cancel <id>`, `retry <id>`.

## Deploy (VPS)

```
psql "$(cat /tmp/locz_dburl)" -f create_job_queue.sql
mkdir -p /home/locz/jobq && cp queue_runner.py jobq.py /home/locz/jobq/
cd /home/locz/jobq && pm2 start queue_runner.py --interpreter python3 --name locz-jobq && pm2 save
```

## Use

```
python3 /home/locz/jobq/jobq.py add --kind refine --cmd "python3 /tmp/refine_sections.py apply" --priority 50
python3 /home/locz/jobq/jobq.py list
```

Never launch heavy batch jobs with bare `nohup` again — enqueue them. The runner keeps the box
under its load ceiling, so the api, web and Postgres always keep their share of the 4 cores.

## Design notes

- **Load-gated, not just concurrency-gated:** even one job waits if load is already high (e.g. a
  traffic spike or a deploy build), so batch work always yields to live traffic.
- **Priority + FIFO:** urgent pulls (`--priority 10`) jump ahead of bulk backfills (`--priority 100`).
- **Resumable jobs stay resumable:** the queued command should itself be idempotent (`WHERE col IS
NULL`), so a retry re-does only what's left.
- **Not BullMQ:** the existing `locz-worker` BullMQ handles _in-app_ Node jobs (news scheduler,
  retention). This queue is for _ops_ batch scripts (Python), where a tiny Postgres-backed queue is
  simpler than bridging shell scripts into BullMQ.
