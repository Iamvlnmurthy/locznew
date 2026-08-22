# Codex brief — pull & generate city images for `locz_cities.db`

You are filling the **image slots** for LocZ's 96 Tier 1/2 city pages. Work **step by step, in
batches**, resumable — there are ~600+ slots now and it will grow into the thousands as we add
localities and attractions. **Plan first, then pull/generate.**

## The store

Local SQLite: `scripts/city-content/locz_cities.db` (rebuild if missing:
`python scripts/city-content/build_city_db.py`). The relevant table:

```
city_images(
  id, city_id, attraction_id, kind, title,
  storage_url, source_url, provider, source, license, attribution, attribution_required,
  width, height, content_hash, status, prompt, created_at
)
```

- `kind`: `HERO` (one per city, wide) · `ATTRACTION` (one per top attraction) · `MAP` (one per city).
- `status`: **`NEEDED`** → set to `PULLED` or `GENERATED` when done (idempotent: skip anything not NEEDED).
- `provider`: the _suggested_ route (`pull` for MAP, `codex` for HERO/ATTRACTION) — **you may override**:
  always **prefer a real public-licensed photo when one exists**; generate only to fill gaps.
- `prompt`: a starter generation brief is already filled for HERO and ATTRACTION slots — refine it.
- Join `city_images.city_id → cities` for `city_name, state_ut, latitude, longitude, city_slug`,
  and `attraction_id → city_attractions` for the exact place name.

## What to do per slot

1. **HERO** — the city's most iconic wide shot (skyline/landmark).
   - **Pull first:** search **Wikimedia Commons** (and other explicitly free/CC/public-domain
     sources) for a high-res photo of the city's signature landmark/skyline.
   - **Generate** (GPT image / `gpt-image-1` / DALL·E 3) only if no good free photo exists.
2. **ATTRACTION** — the specific place (Charminar, Golconda Fort, Marudamalai Temple…).
   - **Pull first** from Commons (these are real, photographed places).
   - Generate only when missing.
3. **MAP** — a clean location map for the city (use `latitude/longitude`). A static map image or a
   simple styled map graphic; pull from a permissively-licensed map source or generate a stylised one.

**Maximise pulled real photos** (authentic > synthetic); use generation to fill gaps and for a
consistent hero look.

## Match the LocZ theme

- Brand: **emerald** `#0e7c5a` / deep `#0a4a38`, **coral** accent `#f2603f`; clean, modern, premium
  (think a polished travel/discovery app, not clip-art).
- Generated images: **photoreal or tasteful editorial**, warm natural light, **no text, no
  watermarks, no logos, no borders**. Cohesive color/mood across a city so its page feels like one set.
- Aspect ratios: **HERO 16:9** (≥1600px wide), **ATTRACTION 4:3** (≥1200px), **MAP ~1:1**.
- Output **WebP** (or JPG), reasonable file size; also keep width/height.

## Licensing (hard rules)

- Pull only **CC / public-domain / explicitly-free** images. **Record** `source`, `source_url`,
  `license`, `attribution`, and set `attribution_required` correctly (Commons CC-BY/BY-SA → 1).
- **Never** pull copyrighted press/agency/stock photos.
- Generated images are LocZ's own → `provider='codex'`, `license='LocZ-generated'`, no attribution.

## Storage

- Stage files under `scripts/city-content/images/<city_slug>/<kind>-<id>.webp` for now (final home
  is object storage / R2 — we'll migrate). Set `storage_url` to that path.
- Compute a `content_hash` (sha256) per file so duplicates can be detected.

## Update the row when done

Set: `storage_url`, `provider`, `source`, `source_url`, `license`, `attribution`,
`attribution_required`, `width`, `height`, `content_hash`, and `status` = `PULLED` or `GENERATED`.

## Workflow

1. **Plan** (write it out first): count NEEDED slots by kind; decide the pull-vs-generate split;
   list the sources you'll pull from; define batch size (e.g. 50 slots/run) and order (HERO first,
   then top attractions, then maps; Tier 1 cities before Tier 2).
2. Build a **resumable pipeline script** (skips non-NEEDED rows, safe to re-run).
3. Run in **batches**, committing rows as you go; print a progress line per batch
   (`pulled X / generated Y / failed Z / remaining N`).
4. On failure for a slot, leave it `NEEDED` and log why — don't block the batch.

## Deliverables

- The written plan + the pipeline script(s).
- Populated `city_images` rows + staged image files.
- A final report: total pulled vs generated, per-tier coverage, any slots still NEEDED and why.

Prioritise **Tier 1 (8 cities)** end-to-end first so we can review the look before you fan out to
all 96.
