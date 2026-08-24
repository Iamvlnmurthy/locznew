"""LocZ VPS job-queue runner — drains job_queue one job at a time, load-gated.

Loop: if 1-min load-per-core and free RAM have headroom, atomically claim the next queued job
(lowest priority number, then FIFO), run it niced/ioniced so it yields to api/web/Postgres,
record the result, cool down, repeat. Concurrency is exactly 1 — that is the whole point: no
matter how many jobs are enqueued, only one heavy task runs, and only when the box can take it.

Run under pm2:  pm2 start queue_runner.py --interpreter python3 --name locz-jobq
Env: MAX_LOAD_PER_CORE (default 1.3), MIN_FREE_MB (500), POLL_SECS (20), COOLDOWN_SECS (10).
"""
import os, sys, io, time, subprocess, multiprocessing, psycopg
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

DBURL = open("/tmp/locz_dburl").read().strip()
CORES = multiprocessing.cpu_count()
MAX_LOAD = float(os.environ.get("MAX_LOAD_PER_CORE", "1.3")) * CORES
MIN_FREE_MB = int(os.environ.get("MIN_FREE_MB", "500"))
POLL = int(os.environ.get("POLL_SECS", "20"))
COOLDOWN = int(os.environ.get("COOLDOWN_SECS", "10"))


def headroom():
    load1 = os.getloadavg()[0]
    with open("/proc/meminfo") as f:
        mem = {l.split(":")[0]: int(l.split()[1]) for l in f}
    free_mb = mem.get("MemAvailable", 0) // 1024
    return (load1 < MAX_LOAD and free_mb > MIN_FREE_MB), load1, free_mb


def claim(conn):
    # atomic: one runner, but SKIP LOCKED keeps it safe even if two ever run
    row = conn.execute(
        "UPDATE job_queue SET status='running', started_at=now(), attempts=attempts+1 "
        "WHERE id = (SELECT id FROM job_queue WHERE status='queued' "
        "ORDER BY priority, id FOR UPDATE SKIP LOCKED LIMIT 1) "
        "RETURNING id, kind, command, attempts, max_attempts").fetchone()
    return row


def run_job(job_id, kind, command):
    print(f"[{time.strftime('%H:%M:%S')}] run #{job_id} ({kind}): {command[:80]}", flush=True)
    p = subprocess.run(["nice", "-n", "15", "ionice", "-c3", "bash", "-lc", command],
                       capture_output=True, text=True)
    tail = (p.stdout + p.stderr)[-2000:]
    return p.returncode == 0, tail


def main():
    conn = psycopg.connect(DBURL, autocommit=True)
    print(f"jobq runner up — {CORES} cores, gate load<{MAX_LOAD:.1f}, free>{MIN_FREE_MB}MB", flush=True)
    while True:
        ok, load1, free_mb = headroom()
        if not ok:
            time.sleep(POLL); continue
        job = claim(conn)
        if not job:
            time.sleep(POLL); continue
        job_id, kind, command, attempts, max_attempts = job
        good, tail = run_job(job_id, kind, command)
        if good:
            conn.execute("UPDATE job_queue SET status='done', finished_at=now(), log_tail=%s WHERE id=%s",
                         (tail, job_id))
        elif attempts < max_attempts:
            conn.execute("UPDATE job_queue SET status='queued', log_tail=%s WHERE id=%s", (tail, job_id))
        else:
            conn.execute("UPDATE job_queue SET status='failed', finished_at=now(), log_tail=%s WHERE id=%s",
                         (tail, job_id))
        print(f"[{time.strftime('%H:%M:%S')}] #{job_id} {'done' if good else 'failed'}", flush=True)
        time.sleep(COOLDOWN)


if __name__ == "__main__":
    main()
