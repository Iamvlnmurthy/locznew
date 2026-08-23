"""Tell Bing which pages changed, instead of waiting to be crawled.

Search Console says Google has *discovered* 1.77 million LocZ pages and indexed
19,200 of them. Discovery is not the constraint; being fetched is. IndexNow
inverts that for the engines that support it — Bing, Yandex, Seznam, Naver — by
letting the site push a list of changed URLs rather than wait for a crawler to
come round.

Why not the Bing Webmaster API: its quota is 100 URLs a day and 900 a month. At
2.96 million pages that is eighty-one years. IndexNow takes 10,000 per request.

**Only pages that actually changed.** IndexNow is for change notification, and
submitting an unchanged corpus is both useless and the kind of thing that gets a
site's submissions ignored. This reads `updatedAt` and sends what moved.

    python scripts/business-enrichment/indexnow_submit.py                # dry run
    python scripts/business-enrichment/indexnow_submit.py send           # last 24h
    python scripts/business-enrichment/indexnow_submit.py send --hours 6
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _db  # noqa: E402

_db.utf8_stdout()

HOST = "locz.in"
KEY = "d928b77b2748c06502cec7de59ea3772"
KEY_URL = f"https://{HOST}/{KEY}.txt"
ENDPOINT = "https://api.indexnow.org/indexnow"

SEND = "send" in sys.argv
HOURS = 24
if "--hours" in sys.argv:
    HOURS = int(sys.argv[sys.argv.index("--hours") + 1])

BATCH = 10_000          # the protocol's per-request maximum
MAX_PER_RUN = 100_000   # a courtesy ceiling, not a protocol one
PAUSE = 2.0             # seconds between requests


def changed_urls(hours):
    """Business pages whose record changed recently, most recent first.

    Only pages that would be indexed anyway: the sitemap's own filter, so this
    never announces a URL that robots or the sitemap would decline to offer.
    """
    conn = _db.connect(statement_timeout="300s")
    junk = (
        r"(sub ?centre|anganwadi|panchayat|primary health|fair price|ration shop|"
        r"milk collection|^unnamed|^unknown|^n/?a$|^null$|^test$)"
    )
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT slug FROM businesses
            WHERE "deletedAt" IS NULL AND "isActive"
              AND ("claimStatus" = 'CLAIMED' OR "verificationStatus" = 'VERIFIED'
                   OR "primaryPhone" IS NOT NULL OR description IS NOT NULL)
              AND name !~* %s
              AND char_length(btrim(name)) > 2
              AND "updatedAt" > now() - make_interval(hours => %s)
            ORDER BY "updatedAt" DESC
            LIMIT %s
            """,
            (junk, hours, MAX_PER_RUN),
        )
        slugs = [r[0] for r in cur.fetchall()]
    conn.close()
    return [f"https://{HOST}/b/{s}" for s in slugs]


def submit(urls):
    payload = json.dumps(
        {"host": HOST, "key": KEY, "keyLocation": KEY_URL, "urlList": urls}
    ).encode()
    request = urllib.request.Request(
        ENDPOINT, payload, {"Content-Type": "application/json; charset=utf-8"}
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, ""
    except urllib.error.HTTPError as error:
        # 422 means the key file could not be read, which is the usual failure
        # and worth distinguishing from a rejected URL list.
        return error.code, error.read().decode("utf-8", "replace")[:200]


def main():
    # The key file must be readable before anything is announced; without it every
    # submission is rejected and the run looks successful from here.
    try:
        with urllib.request.urlopen(KEY_URL, timeout=30) as response:
            served = response.read().decode().strip()
        if served != KEY:
            print(f"key file at {KEY_URL} says {served!r}, expected {KEY!r}")
            return
        print(f"key file verified: {KEY_URL}")
    except Exception as error:
        print(f"key file unreachable at {KEY_URL}: {error}")
        print("Deploy apps/web/public/<key>.txt before submitting.")
        return

    urls = changed_urls(HOURS)
    print(f"{len(urls):,} business pages changed in the last {HOURS}h")
    if not urls:
        return
    if not SEND:
        print("\nDRY RUN — nothing sent. Re-run with 'send'.")
        for u in urls[:5]:
            print(f"  {u}")
        return

    sent = 0
    for i in range(0, len(urls), BATCH):
        chunk = urls[i : i + BATCH]
        status, detail = submit(chunk)
        ok = status in (200, 202)
        print(f"  {i + len(chunk):>7,}/{len(urls):,}  HTTP {status}"
              + ("" if ok else f"  {detail}"))
        if not ok:
            print("  stopping: a rejected batch usually means the key or host is wrong")
            break
        sent += len(chunk)
        if i + BATCH < len(urls):
            time.sleep(PAUSE)
    print(f"\nsubmitted {sent:,} URLs")


if __name__ == "__main__":
    main()
