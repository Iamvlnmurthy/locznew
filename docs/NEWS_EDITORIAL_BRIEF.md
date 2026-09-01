# Brief — News editorial-standards page + "LocZ News Desk" byline

**Why:** LocZ news is AI-assisted (sourced → rewritten in LocZ voice → integrity gate → translated).
To stay clearly on the right side of Google's **scaled-content** policy — and protect the whole
domain's trust — the news needs visible **human-oversight / E-E-A-T** signals. Volume is <100/day,
which is fine; this is about signalling value and oversight.

**Do:**

1. New page **`/news/editorial-standards`** (or `/news/about`): honest, specific copy on how LocZ
   sources stories, rewrites them in its own voice, applies an integrity gate, avoids fabrication,
   credits sources, and how to report a correction (contact/correction path). Link it from the news
   feed header/footer.
2. Add a visible **"LocZ News Desk"** byline/attribution on each article
   (`apps/web/src/app/news/[slug]/page.tsx`) with a "How this is written →" link to the standards
   page.
3. Keep it real and specific — not boilerplate. Actual editorial policy.
4. i18n (en/hi/te); minimal, on-brand; SEE-gate.

**Related backend already shipped:** near-duplicate dedup (trigram guard on recent headlines) and
Telugu/Hindi dek translation are live. Remaining scaled-content options (Claude can build): a
noindex-low-confidence heuristic; the editorial page above is the biggest trust win.
