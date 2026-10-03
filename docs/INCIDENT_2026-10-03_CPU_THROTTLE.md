# 3 October 2026 — the VPS was throttled by the host

**Status: partly fixed.** Seven indexes added, the largest one still outstanding.

Hostinger capped the CPU on `mail.obliquemedia.in` (76.13.242.93 — the same box that runs
LocZ, mail, CyberPanel and several other applications) at around 03:00. The cause was not a
runaway process: it was four tables being read sequentially, hundreds of billions of rows at a
time, because the indexes those queries needed did not exist.

---

## How to tell a throttle from a busy server

The load average said 25–32 on four cores, which looks like catastrophic overload. It was not.
`top` shows why:

```
%Cpu(s):  2.4 us,  1.9 sy,  0.0 ni,  0.0 id,  0.0 wa,  0.0 hi,  0.2 si,  95.5 st
                                                                         ^^^^^^^
```

**`st` is steal time.** 95.5% of cycles were being withheld by the hypervisor, so ~4.5% of one
core reached our processes and everything else queued. Sustained across three samples.

Worth knowing the signature, because the three readings point in different directions:

| reading                           | what it suggests           | what it was                                 |
| --------------------------------- | -------------------------- | ------------------------------------------- |
| load 25–32                        | the server is overwhelmed  | processes queuing for CPU that was withheld |
| no process above 8.9%             | nothing is consuming CPU   | nothing _could_, there was none to consume  |
| `wa` 0.0, no processes in D state | not disk-bound             | correct — the disk was fine                 |
| **`st` 95.5%**                    | **the host is throttling** | **this one**                                |

Hostinger's own graph agreed: CPU ran 50–70% all day, reached 100% around 01:00, and the
limitation stepped in at about 03:00.

---

## The cause

`pg_stat_user_tables`, which counts sequential scans and the rows they read:

| table           | seq scans | rows read sequentially | indexes it had                           |
| --------------- | --------: | ---------------------: | ---------------------------------------- |
| `addresses`     |   189,144 |    **536,502,540,150** | pkey, `cityId`, geo                      |
| `localities`    |   236,176 |         57,612,451,380 | several, but not `slug`                  |
| `post_offices`  |   872,784 |         48,391,849,605 | **none at all**                          |
| `bank_branches` |   251,037 |         22,191,076,829 | bank+city, bank+district, branch trigram |
| `businesses`    |     8,313 |         26,661,069,315 | well indexed; this one is fine           |

**Over half a trillion rows read from `addresses` alone.** `post_offices` had been fully
scanned 872,784 times and had never once used an index, because it had none — not even a
primary key.

Those tables sit behind features added after August; the sitemap index now lists
`sitemap-ifsc.xml` and `sitemap-services.xml`.

### The same fact from the process list

```
 72.9 h cpu   postgres: io worker 0      40.7 days uptime
 49.9 h cpu   postgres: io worker 1
 39.9 h cpu   postgres: io worker 2
─────────
162.7 h       three processes

 20.4 h       docker-proxy
  8.3 h       PM2 God Daemon
  7.1 h       next-server  (user `caller`, not LocZ)
  4.6 h       locz api worker
```

PostgreSQL's asynchronous I/O workers burned **162.7 CPU-hours in 40 days** — eight times the
next process and more than everything else combined. Their only job is moving data from disk
into memory, and they were that busy because the scans gave them 664 billion rows to move that
an index would have let the database skip.

**LocZ's own application code is not the problem.** `next-server` does not appear in the top
fifteen; the API worker used 4.6 hours in 40 days. This is entirely a database access-pattern
problem.

---

## What was done

Seven indexes, all `CONCURRENTLY` so nothing locked and the site stayed up:

```sql
CREATE INDEX CONCURRENTLY post_offices_pincode_idx        ON post_offices (pincode);
CREATE INDEX CONCURRENTLY post_offices_state_district_idx ON post_offices (lower(statename), lower(district));
CREATE INDEX CONCURRENTLY post_offices_office_idx         ON post_offices (lower(officename));

CREATE INDEX CONCURRENTLY bank_branches_city_idx          ON bank_branches (lower(city));
CREATE INDEX CONCURRENTLY bank_branches_district_idx      ON bank_branches (lower(district));
CREATE INDEX CONCURRENTLY bank_branches_state_idx         ON bank_branches (lower(state));

CREATE INDEX CONCURRENTLY localities_slug_idx             ON localities (slug);
```

Total added: about 19 MB. All confirmed present.

`bank_branches` already had `(lower(bank), lower(city))` and `(lower(bank), lower(district))`,
so the 251,037 scans mean queries filter on city, district or state _without_ the bank — hence
the three single-column indexes rather than more composites.

---

## What is still outstanding

```sql
CREATE INDEX CONCURRENTLY addresses_locality_idx ON addresses ("localityId");
```

**This is roughly 80% of the problem.** `addresses` accounts for 536 billion of the 664 billion
rows read, and nothing currently indexes `localityId` — the column every locality-scoped query
filters on.

It was not created because the shell quoting failed first (the column is camelCase and needs
double quotes, which the nested `ssh → docker exec → psql` quoting ate), and then because
building a 1.6 GB index on a box at 95% steal is slow — likely 10–20 minutes rather than one.
`CONCURRENTLY` keeps the site up throughout, but it adds I/O while the machine is already
constrained.

**Do it before asking Hostinger to lift the limitation**, or the throttle will return. Pipe the
SQL through stdin to avoid the quoting problem:

```bash
cat <<'SQL' | ssh <host> "docker exec -i locz-postgres psql -U locz -d locz"
SET statement_timeout='900s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS addresses_locality_idx ON addresses ("localityId");
SQL
```

---

## Afterwards

**Reset the counters** so the next reading is about the next period, not this one:

```sql
SELECT pg_stat_reset();
```

**Re-read the scan counts** after a day. `seq_tup_read` on `addresses` should be close to flat.

**Then ask Hostinger to remove the limitation** — their panel has a "Remove limitations" button,
and the cause has to be addressed first or it reapplies.

### Worth doing, not urgent

- **Install `pg_stat_statements`.** It was not enabled, so there was no way to ask which queries
  were expensive — the diagnosis had to be reconstructed from table-level scan counts. It needs
  a restart, so it is a job for a quiet moment, and it would have turned an hour of inference
  into one query.
- **`monarx-agent`** uses about 2% of a core continuously (5.3 h in 10.6 days). Not a cause, but
  it is the only item on the list that could simply be removed if headroom is wanted.
- **The box is shared.** `next-server` under user `caller`, `onrol-s+`, supabase, dograh and
  wos-grafana all run here. A CPU limit is charged against the whole VPS, so LocZ is not the only
  thing that can trigger one.

---

## The lesson worth keeping

A feature can ship, work correctly, pass review and still take down a server three weeks later,
because nothing about a missing index is visible until the table is large and the traffic is
real. `post_offices` has 165,627 rows — small enough that every query against it looked instant
in development, and 872,784 full scans later it was reading 48 billion rows.

**When adding a table that a page queries, add the index in the same change.** And
`pg_stat_user_tables` is the first place to look when CPU is unexplained — not `top`, which in
this case named the symptom and hid the cause.
