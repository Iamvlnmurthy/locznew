"""Connecting to the production database without taking it down.

This exists because of a specific incident. A five-row sample written as

    SELECT ... FROM businesses b JOIN categories ... JOIN cities ...
    ORDER BY random() LIMIT 5

read as harmless -- it returns five rows. But `ORDER BY random()` has to generate a
random value for all 4.2 million rows before it can pick five, and the joins build hash
tables over the whole table to do it. The backend reached 3.5 GB, the host OOM killer
took it, and PostgreSQL went into crash recovery. The site was down for about a minute
and every other application on that machine was at risk, because the container has no
memory limit of its own.

Nothing was lost -- redo was 1.4 MB and recovery took a tenth of a second -- but the
margin was luck rather than design.

Two rules follow, and this module exists to make them the default:

1. **Bound every statement.** A query that cannot finish should be cancelled by the
   server, not by the kernel. `connect()` sets a statement timeout, a work_mem ceiling
   and turns off parallel query, because parallel workers multiply the memory a single
   query can hold.

2. **Walk a large table in chunks.** `chunks()` pages by primary key rather than
   OFFSET: OFFSET re-scans from the beginning every time, so the last page of a 4.2M
   table costs 4.2M rows. Keyset paging costs one index seek per chunk regardless of
   how deep it is.

Neither rule is about being cautious with a read. It is that on a table this size the
difference between a bounded query and an unbounded one is the difference between a
slow answer and an outage.
"""

import io
import os
import sys

import psycopg

# Written by the tooling that set up the tunnel. The port matters: locz-postgres is
# published on 127.0.0.1:5433, while 5432 on that host belongs to a different
# application entirely. A tunnel pointed at 5432 reaches the wrong database, and the
# only thing that stopped one doing so was a password failure.
DEFAULT_URL_FILE = (
    r"C:/Users/USER/AppData/Local/Temp/claude/"
    r"c--Users-USER--gemini-antigravity-scratch-locz/"
    r"3d997973-355f-47a0-92fe-f818913a2334/scratchpad/pgurl.txt"
)


def url():
    """The connection string, from the environment or the tunnel file."""
    return os.environ.get("DATABASE_URL") or io.open(DEFAULT_URL_FILE).read().strip()


def connect(statement_timeout="120s", work_mem="32MB", parallel=False, autocommit=False):
    """A connection that cannot run away with the server.

    `parallel=False` is the default deliberately. Parallel workers each get their own
    work_mem, so a plan that looks like it fits can use several times what you allowed.
    Turn it on only for a query you have already run under EXPLAIN.
    """
    conn = psycopg.connect(url(), connect_timeout=90, autocommit=autocommit)
    with conn.cursor() as cur:
        cur.execute(f"SET statement_timeout = '{statement_timeout}'")
        cur.execute(f"SET work_mem = '{work_mem}'")
        cur.execute(f"SET max_parallel_workers_per_gather = {2 if parallel else 0}")
        # An analysis session should never be the reason a write waits.
        cur.execute("SET lock_timeout = '5s'")
    if not autocommit:
        conn.commit()
    return conn


def chunks(conn, table, columns="id", where="TRUE", params=(), size=5000, key="id"):
    """Yield rows from a large table in keyset-paged chunks.

    The alternative people reach for is LIMIT/OFFSET, which re-reads every skipped row:
    walking 4.2M rows 5,000 at a time costs about 1.7 billion row reads by the end.
    Paging on the key costs one index seek per chunk.

        for row in chunks(conn, 'businesses', 'id, name',
                          where='"deletedAt" IS NULL', size=2000):
            ...

    Each chunk is its own statement, so a long walk holds no snapshot open and a failure
    costs one chunk rather than the run.
    """
    last = None
    while True:
        if last is None:
            sql = (f'SELECT {columns} FROM {table} WHERE {where} '
                   f'ORDER BY "{key}" LIMIT {size}')
            args = tuple(params)
        else:
            sql = (f'SELECT {columns} FROM {table} WHERE {where} AND "{key}" > %s '
                   f'ORDER BY "{key}" LIMIT {size}')
            args = tuple(params) + (last,)
        with conn.cursor() as cur:
            cur.execute(sql, args)
            rows = cur.fetchall()
        if not rows:
            return
        for row in rows:
            yield row
        last = rows[-1][0]
        if len(rows) < size:
            return


def sample(conn, table, where="TRUE", n=5, fraction=0.05):
    """A handful of random rows, without sorting the table to get them.

    TABLESAMPLE reads a fraction of the pages and stops. It is not a uniform sample --
    it favours rows that share a page -- which is fine for eyeballing enrichment and
    wrong for statistics. `ORDER BY random()` is the uniform version and is what caused
    the outage this module documents.
    """
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT * FROM {table} TABLESAMPLE SYSTEM ({fraction}) "
            f"WHERE {where} LIMIT {n}"
        )
        return cur.fetchall()


def utf8_stdout():
    """Print Indic text without dying.

    A transliteration run was killed by UnicodeEncodeError writing Telugu to a cp1252
    console -- the work was fine, the progress line was fatal.
    """
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
