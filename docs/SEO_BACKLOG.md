# SEO backlog

Ongoing SEO tasks and content-input ideas for LocZ. Ordered loosely by impact.

## Content

- **Mine "People Also Ask" (PAA) questions via AlsoAsked.com for FAQ + content.**
  AlsoAsked (paid tool, no free API — a periodic manual/exported research input, not an automated
  pipeline) maps the PAA question tree for a query. Use it to source **real user questions** for:
  - **Service-area pages** (`/services/[category]/[area]`) — the FAQ + `Service`/FAQPage JSON-LD
    should answer actual PAA questions (e.g. "how much does an electrician charge in Gachibowli",
    "how to find a plumber near me"), which wins featured snippets and PAA boxes across the ~23k
    service pages.
  - **Business/category pages** — locality/category FAQs from PAA.
  - **News** — PAA around local topics can shape headlines/deks for search visibility.
    Workflow: run AlsoAsked per top category × top metro, export the questions, feed them into the
    FAQ generation (curated, not auto-scraped), refresh quarterly.

## Already done (for reference)

- Service-area SEO pages live (16,878 → 23,328 after re-categorization); `sitemap-services.xml`
  in robots + submitted to GSC.
- `noindex` on thin/unclaimed business pages (indexable once claimed/complete) — deliberate.
- Sitemaps submitted after the Overture import + re-categorization.

## Related, still open

- **Google Discover for news** — gated on the news-image sourcing decision (see
  [[NEWS_DISCOVER_BRIEF]] / the Magnific stock-image plan). Add `max-image-preview:large` +
  `og:image` once real ≥1200px images replace the e-paper scans.
- Service-page count-query optimization under crawl load (see NEARBY/services notes).
