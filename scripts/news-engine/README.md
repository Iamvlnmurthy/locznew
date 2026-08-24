# LocZ News Engine (runs on the GPU box, not the VPS)

Pull → regenerate (LocZ journalist voice, local LLM) → **integrity-gate (drop-on-fail)** →
translate to Hindi + state language (IndicTrans2) → og:image + credit → categorize →
POST to VPS `news_stories`. All local + free on the RTX 5060. The VPS only serves.

## Pipeline

1. `engine.py` — orchestrator. `python engine.py once [--limit N]` (one cycle) / `loop` (hourly).
2. `insert_stories.py` — VPS receiver (stdin JSON → `news_stories`), lives at `/tmp/insert_stories.py`.
3. `create_news_stories.sql` — parallel prod table, kept separate from the live NewsEvent/NewsArticle
   so the current feed is undisturbed until the API switches over.

## Runtime (this machine)

- venv `C:\it2v` (torch cu128, transformers 4.46, IndicTransToolkit) — see memory `locz-indictrans2-stack`.
- Ollama `qwen2.5:7b-instruct` for regeneration; IndicTrans2 `en-indic-1B` for translation.
- Needs `HF_TOKEN` (user env) + `PYTHONUTF8=1`.

## Auto-start

Deployed copy lives at `C:\locz-news\`. `run_engine.bat` runs `engine.py loop`. Started at **logon**
by `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\locz-news-engine.vbs` (hidden, no admin —
this box has no admin, so Task Scheduler can't be used). Logs to `C:\locz-news\engine.log`.

## Integrity gate (interim = DROP)

Drops any story with: a fabricated quote (quotes not verbatim in source), an invented number/year
(not present in source), or an out-of-range body length. When a human reviewer is assigned, flip the
drop to `status='HELD'` for the review queue instead of discarding.

## Feed API (DONE, live) — for Codex's news pages

`GET /api/v1/news/stories` — the distance-increasing feed over `news_stories`:

- Query: `latitude`,`longitude` (anchor; omit → recency order), `category`, `state`, `city`,
  `when` (`today|yesterday|week|month|all`), `lang` (`en|hi|te`…), `limit` (≤50), `offset`.
- Returns `{ cards: [{ id, category, title, dek, summary, lang, imageUrl, imageCredit, city,
state, distanceKm, ring: local|city|district|state|national, publishedAt }], hasMore }`.
- Rings fill outward (nearest first) so a quiet area still returns a full page.
  `GET /api/v1/news/stories/:id?lang=te` — one story (title/dek/body in the chosen language).
  Build the news list + article pages against this shape. In-article ad slot goes in the body
  (see ADS_PLACEMENT_BRIEF.md). `image_credit` renders **under** the image; no source is shown.

## Still TODO (not built yet)

- News sitemap (Google News `<news:>` sitemap, <48h) + sharded archive sitemaps in robots.txt +
  Google Publisher Center. IndexNow already works but only reaches Bing/Yandex, **not Google**.
- Scale FEEDS to 30+ states × 8 categories; add all STATE_LANG entries.
- Category classifier (currently the feed's own category).
