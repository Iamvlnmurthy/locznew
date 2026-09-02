# News image pipeline & schedule

Own, compressed, premium-licensed **category** photos (not per-headline) served from
`apps/web/public/news-images/<cat>-<i>.webp` (baked into Next at build time). They replaced the
old source `og:image` (copyright risk; e-paper scans blocked Google Discover).

## How it works

- 10 categories (`local, tech, state, entertainment, crime, politics, business, weather, sports,
civic`), a **pool** of N images each. The engine (`scripts/news-engine/engine.py` →
  `news_image()`) picks one at random per story. Pool size is read from `manifest.json`, so the pool
  can **grow with no code edit** — add files + regenerate the manifest.
- Each image is a single-pass **webp ≤46KB** (space budget). 50 images = ~2.2MB today.
- `image_credit` is `NULL` (premium license needs no visible credit).

## The Magnific cap

Magnific stock **downloads are free but capped at ~100/day**. That cap only matters while _building_
the pool — category art doesn't need daily refresh. `refresh_news_images.py` enforces it with a
local ledger (`magnific_ledger.json`, default budget 90/day, headroom under 100). A 402 mid-run
stops cleanly; re-run next day and it resumes from the next free slot. Append-only + idempotent.

## Schedule

| When                                     | Action                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Build-up (now → ~2 days)**             | `MAGNIFIC_API_KEY=… python refresh_news_images.py --target 15` once/day until every category has 15 (≈150 images, still <7MB). Cap-limited to ~90/day, so ~2 runs. |
| **Steady state (monthly-ish, optional)** | Re-run `--target 20` to top up / swap fresh shots, or add a new category to `TERMS`. Not needed for correctness — the pool is self-sufficient.                     |
| **Never**                                | Per-headline AI generation (`/ai/mystic`) — expensive (~50 credits) and pointless for generic category art.                                                        |

## After any run that added images

1. `git add apps/web/public/news-images scripts/news-engine` and commit (explicit paths — Codex
   shares the tree, never `git add -A`).
2. Copy the fresh manifest to the engine box: `cp apps/web/public/news-images/manifest.json
C:\locz-news\news-images\manifest.json` (so the engine knows the new pool size).
3. Deploy web (`scripts/deploy-web.sh` via bundle-over-SSH) — images are baked at build time.
4. Backfill existing stories if desired:
   `UPDATE news_stories SET image_url='/news-images/'||category||'-'||((floor(random()*N))::int+1)||'.webp',
image_credit=NULL;` (isolated table — safe, does **not** touch `businesses`).

## Key handling

`MAGNIFIC_API_KEY` is passed via env only — **never committed**. The scripts read
`os.environ["MAGNIFIC_API_KEY"]`.
