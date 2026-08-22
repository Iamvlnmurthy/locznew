# City image pipeline plan

## Scope and order

The catalog currently contains 609 image slots for 96 cities:

1. Tier 1 HERO: 8 slots — generate as the first visual review batch.
2. Tier 1 ATTRACTION: 40 slots — prefer licensed documentary photographs, generate gaps.
3. Tier 1 MAP: 8 slots — pull from a permissive map source with attribution.
4. Tier 2 HERO: 88 slots, processed in state-sized batches after Tier 1 approval.
5. Tier 2 ATTRACTION: 377 slots, pulled first and generated only for documented gaps.
6. Tier 2 MAP: 88 slots.

Generated images use one prompt per asset and are staged under
`images/<city_slug>/<kind>-<city_images.id>.webp`. SQLite is updated only after the whole
batch has been validated; generation workers never write to the database concurrently.

## Quality gates

- HERO: WebP, at least 1600 px wide, approximately 16:9.
- ATTRACTION: WebP, at least 1200 px wide, approximately 4:3.
- MAP: WebP and approximately square.
- No duplicate SHA-256 within the catalog.
- No text, watermark, logo or invented signage in generated art.
- A human reviews landmark identity and visual accuracy before `APPROVED`.
- Pulled images require a source URL, explicit licence and exact attribution; they are not
  imported through the generated-image helper.

## Resumability

`import_generated_images.py` only considers rows still marked `NEEDED`, derives the expected
path from the row id, validates every candidate first, and commits all valid rows in one SQLite
transaction. Missing or invalid files remain `NEEDED`, so a failed generation never blocks or
corrupts the batch.

Example after the first batch:

```bash
python scripts/city-content/import_generated_images.py --tier 1 --kind HERO
```

Review the staged images, then promote accepted rows from `GENERATED` to `APPROVED` in the
curation workflow. Rejected rows retain their provenance and can be regenerated to a new file
only after the rejected artifact is archived.
