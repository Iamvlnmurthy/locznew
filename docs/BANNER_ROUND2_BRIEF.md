# Round 2: the 200 categories worth covering after the first eight batches

Hand this to Codex **after** the eight batches in `docs/BANNER_GENERATION_BRIEF.md` have
landed and their catalogue entries are merged. Run as **4 parallel agents, one batch each**
— `docs/banner_batches_round2.txt`, balanced by business volume.

## Read this before deciding to run it at all

The first eight batches cover the categories that matter. What is left is a long tail:

|                                                  | categories | businesses |
| ------------------------------------------------ | ---------- | ---------- |
| still with no artwork after the eight batches    | 859        | 83,054     |
| **this brief — the 200 largest of them**         | **200**    | **63,080** |
| the remaining 659, deliberately not commissioned | 659        | ~20,000    |

The largest category here has **593 businesses**. The first round's largest had over 100,000.
This is 2.4% of the directory, and the last 659 categories average 30 businesses each —
roughly 1,300 images to serve a rounding error. **Do not generate those.** A category with no
artwork now renders as a clean dark panel, not a broken one; that is an acceptable ending.

Stop here if the first round is not yet merged. Running both at once means two agents editing
`premium-banner-catalog.ts`, and that file already carries a matcher other work depends on.

## Everything else is unchanged

Follow `docs/BANNER_GENERATION_BRIEF.md` exactly — dimensions, slug rules, style, the export
method, the visual gate, and the catalogue registration. Nothing about the process changes.
Two points from that brief are worth repeating because they cost the first round time:

- **Fill the whole 2000px frame, and keep the bottom third calm.** The identity card runs
  along the bottom of the panel at full width. Art composed with an empty left half — the
  older convention — wastes most of the banner.
- **The generator returns a tall source whatever aspect you ask for.** The first round solved
  this with a proportion-preserving exporter that extends the dark background rather than
  cropping tall objects. Reuse it; do not rediscover it.

## Check the catalogue before generating

Some categories in the first round turned out to _already_ have artwork on disk with no
catalogue key pointing at it. Before generating anything for a category, look:

```bash
ls apps/web/public/banners/categories/ | grep -i "<first word of the category>"
```

If a file already exists, add the key and move on. A registration is a one-line change; a
generation is two images and a review.

## Confirm the result, with the audit rather than by eye

```bash
node scripts/ui-verify/audit-banners.mjs var/categories.txt 0
```

Before this round, that reports:

```
categories: 1406
  exact key      43   37.2% of businesses
  borrowed      226   12.3%
  no banner    1137   50.5%
```

`exact key` must rise by roughly the number of categories you registered. If it does not, the
keys do not match the database spelling character for character and the images are not being
shown — which is the failure this audit exists to catch, and which no screenshot will reveal
because the page still renders a perfectly good borrowed banner.

`scripts/ui-verify/uncovered.mjs` lists what remains uncovered at any point.
