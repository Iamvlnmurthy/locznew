# Brief: category banners for the 357 categories that have none

Hand this to Codex. Run it as **8 parallel agents, one batch each** — the batches are in
`var/banner_batches.txt`, balanced so each agent covers a similar number of businesses.

## The problem

The storefront paints a photographic banner behind the business identity card. The artwork
catalogue (`apps/web/src/lib/premium-banner-catalog.ts`) is keyed by the 45 category names
the directory had when the artwork was drawn. The directory now has **69 parents and 1,375
subcategories**, so a spa filed under "Spas & wellness centres" matches nothing.

There is a word-overlap fallback in place, so no page is currently blank — a wellness centre
borrows the "beauty & wellness" banner. That is a stopgap. **357 categories covering
2,439,845 businesses** are showing borrowed artwork rather than their own.

## What to produce

For each category in your batch, two images:

```
apps/web/public/banners/categories/<slug>-desktop.webp    2000 × 320
apps/web/public/banners/categories/<slug>-mobile.webp     1200 × 400
```

`<slug>` is the category name lower-cased, non-alphanumerics collapsed to single hyphens:
`Schools & colleges` → `schools-colleges`. No version suffix on new files.

## Match the existing art — look at it first

**Before generating anything, open several existing banners** and match what you see. Do not
work from this description alone; it is a summary of images you can look at directly.

```
apps/web/public/banners/categories/bakeries-sweets-v5-desktop.webp
apps/web/public/banners/categories/beauty-wellness-v2-desktop.webp
apps/web/public/banners/categories/automobile-services-v2-desktop.webp
apps/web/public/banners/categories/education-training-desktop.webp
```

What they have in common, and what your output must share:

- **Photographic, not illustrated.** Real objects, real materials, real light.
- **Indian context.** A grocery banner shows Indian provisions, not a Western supermarket.
  A restaurant banner shows Indian food. This directory is entirely Indian businesses.
- **A still life, not a scene.** Objects arranged on a surface, shot from a low or
  three-quarter angle. No people. No faces.
- **Warm, low-key lighting** with a dark, softly graded background, so white text and a
  floating card read clearly on top.
- **The subject sits right of centre.** The left third stays quiet: the business identity
  card overlaps it, and the category and city are printed at the top left.
- **No text, no logos, no signage, no watermarks.** Any lettering in the image will collide
  with the real text the page draws over it.

## Composition constraints that come from the layout

- **Desktop is 2000 × 320 — very wide and short.** Compose for that ratio directly. Do not
  generate a square and crop; the subject ends up decapitated. Ask the image engine for a
  wide cinematic banner.
- **The mobile crop is not the desktop image resized.** At 1200 × 400 the subject must sit
  around 70–76% across, because the phone layout crops toward the right. Generate it
  separately with the subject placed right of centre.
- Keep the centre-bottom clear of important detail; the identity card overlaps it.

## Prompt shape for the image engine

Build each prompt from the category, and keep the style clause identical across every image
so the set looks like one family:

```
A wide cinematic still-life banner of <subject for this category>, arranged on a dark
textured surface, warm low-key side lighting, shallow depth of field, deep muted background
with soft vignette, subject positioned right of centre, generous empty space on the left,
photographic, no people, no text, no logos, 2000x320 ultra-wide aspect ratio.
```

Choose `<subject>` from what the business actually sells or does, in an Indian setting:

| category           | subject                                                |
| ------------------ | ------------------------------------------------------ |
| Medical shops      | pharmacy shelves, medicine strips, a mortar and pestle |
| Petrol pumps       | a fuel nozzle, gauge, dark forecourt reflections       |
| Hindu temples      | brass lamps, marigold garlands, a bell                 |
| Banks & ATMs       | a passbook, coins, a card reader, ledger               |
| Indian restaurants | thali, copper serving bowls, spices                    |
| Schools & colleges | books, a globe, geometry instruments                   |

If a category is abstract (e.g. "Financial services"), photograph its tools — a ledger, a
calculator, documents — never an abstract graphic.

## Registering the artwork

After generating a batch, add each category to `categoryBanners` in
`apps/web/src/lib/premium-banner-catalog.ts`, keyed by the **lower-cased category name
exactly as it appears in the database**:

```ts
'schools & colleges': banner('schools-colleges'),
'medical shops': banner('medical-shops'),
```

The key must match the database name character for character, ampersands included, or the
lookup falls through to the word-overlap fallback and your image is never shown.

## Check the output, do not assume it

For each batch, before moving on:

1. **Look at every generated image.** An image engine asked for a petrol pump will sometimes
   return a petrol station sign with invented lettering. Text in the image is an automatic
   reject — the page prints real text over it.
2. **Confirm the dimensions** are exactly 2000×320 and 1200×400, and that the files are
   `.webp`. A wrongly sized file distorts the banner rather than failing visibly.
3. **Render one storefront per batch** and look at it, at 1440px and at 390px. A typecheck
   cannot see a banner that is upside down, and this is the mistake to avoid: the storefront
   has already shipped broken twice today because output was inferred from a green build
   rather than looked at.

```bash
# from the repo root
./var/shots/shot.sh "https://locz.in/b/<some-slug-in-that-category>" check-<batch> 1440
```

4. **Keep the total under control.** 714 images at roughly 150–250 KB each is 110–180 MB in
   `public/`. If any file exceeds 300 KB, re-encode it rather than committing it.

## What not to do

- Do not touch the existing 242 banners. They are the reference, and businesses are using
  them now.
- Do not remove the word-overlap fallback in `premiumBusinessBanner`. It is what keeps a
  category added next month from rendering a blank panel.
- Do not generate for categories with no businesses. The batches list only categories that
  are in use; anything outside them is wasted work.
