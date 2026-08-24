"""LocZ job-queue CLI. Enqueue/list/cancel jobs the load-aware runner will drain.

  python3 jobq.py add --kind refine --cmd "python3 /tmp/refine_sections.py apply" [--priority 50]
  python3 jobq.py list
  python3 jobq.py cancel <id>
  python3 jobq.py retry  <id>
"""
import sys, os, argparse, psycopg

c = psycopg.connect(open("/tmp/locz_dburl").read().strip(), autocommit=True)
ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest="cmd", required=True)
a = sub.add_parser("add"); a.add_argument("--kind", required=True); a.add_argument("--cmd", required=True)
a.add_argument("--priority", type=int, default=100); a.add_argument("--max-attempts", type=int, default=1)
sub.add_parser("list");
cc = sub.add_parser("cancel"); cc.add_argument("id", type=int)
rr = sub.add_parser("retry"); rr.add_argument("id", type=int)
args = ap.parse_args()

if args.cmd == "add":
    jid = c.execute(
        "INSERT INTO job_queue (kind, command, priority, max_attempts, enqueued_by) "
        "VALUES (%s,%s,%s,%s,%s) RETURNING id",
        (args.kind, args.cmd, args.priority, args.max_attempts, os.environ.get("USER", "cli"))).fetchone()[0]
    print(f"queued job #{jid}")
elif args.cmd == "list":
    for r in c.execute("SELECT id,status,priority,kind,left(command,50),attempts "
                       "FROM job_queue ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 "
                       "ELSE 2 END, priority, id DESC LIMIT 40").fetchall():
        print(f"#{r[0]:<5} {r[1]:<8} p{r[2]:<4} {r[3]:<10} {r[4]:<52} att={r[5]}")
elif args.cmd == "cancel":
    n = c.execute("UPDATE job_queue SET status='canceled' WHERE id=%s AND status='queued'", (args.id,)).rowcount
    print("canceled" if n else "not cancelable (not queued)")
elif args.cmd == "retry":
    n = c.execute("UPDATE job_queue SET status='queued', finished_at=NULL WHERE id=%s "
                  "AND status IN ('failed','canceled')", (args.id,)).rowcount
    print("re-queued" if n else "not retryable")
