# LocZ city-content database — `locz_cities.db`

A **local SQLite** store of curated content for the **96 Tier 1 + Tier 2 cities** (history,
tourism, major places, food, economy, images). Built from `india_tier1_tier2_96_cities_master.csv`
by `build_city_db.py`, then enriched with real, LocZ-voiced content (see "Enrichment"). This is a
**staging store** — we curate here, then plan how to load it into the app's Postgres.

Rebuild (idempotent, drops + recreates):

```bash
python scripts/city-content/build_city_db.py
```

## Tables

| Table              | Rows   | Notes                                                                                                                                                           |
| ------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cities`           | 96     | identity + descriptive scalars; `tier` 1/2; `needs_regeneration=1` = templated text to replace                                                                  |
| `city_history`     | ~576   | **one row per era** (`FOUNDING/ANCIENT/MEDIEVAL/COLONIAL/POST_INDEPENDENCE/EVENTS`) — fixes the CSV's duplicated history; `needs_regeneration`/`source` per row |
| `city_attractions` | ~417   | ranked major places (from `attraction_1..5` + `major_attractions`)                                                                                              |
| `city_food`        | ~897   | `kind` = FAMOUS_DISH/STREET_FOOD/SWEET/BEVERAGE/VEG/NONVEG                                                                                                      |
| `city_industries`  | ~422   | economy                                                                                                                                                         |
| `city_attributes`  | ~2,680 | long-tail static fields as typed key/value (`category`, `field`, `value`)                                                                                       |
| **`city_images`**  | ~609   | **image storage** — see below                                                                                                                                   |

## `city_images` — for Codex

One row per image slot. Files live in object storage; this row holds the reference + provenance.

- `kind`: `HERO` | `LANDMARK` | `ATTRACTION` | `MAP` | `GALLERY`
- `provider`: `pull` (fetched from a licensed source) | `codex` (generate) | `upload`
- `status`: **`NEEDED`** → `PULLED`/`GENERATED` → `APPROVED`/`REJECTED`
- `prompt`: the generation brief when `provider='codex'` (already filled for HERO + ATTRACTION slots)
- `attraction_id`: links an ATTRACTION image to its `city_attractions` row
- `storage_url`, `source_url`, `source`, `license`, `attribution`, `width`, `height`, `content_hash`

**Codex workflow:** query `SELECT * FROM city_images WHERE status='NEEDED' AND provider='codex'`,
generate each from its `prompt`, upload to object storage, then set `storage_url`, `width`,
`height`, `content_hash`, `status='GENERATED'`. `provider='pull'` slots (MAP) are fetched from a
licensed source instead.

## Enrichment (real content, not the CSV's templated text)

Templated/placeholder fields (all 96 descriptions, some history) are flagged `needs_regeneration=1`.
The enrichment step fetches a real source (e.g. Wikipedia, CC BY-SA) and rewrites it into LocZ's
own words via an LLM, storing `source` for attribution. Providers available (keys in other
projects' env, referenced not committed): **Gemini 2.5 Flash** (best Telugu), **Groq**
(qwen3.6-27b, fastest), **Cerebras** (gpt-oss-120b), or the local Ollama `gemma2:9b`.
Hyderabad is done as the pilot.
