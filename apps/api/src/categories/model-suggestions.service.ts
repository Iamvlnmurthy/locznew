import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Model-name suggestions for the categories where the model is what people type.
 *
 * Model is deliberately *not* a picklist. There are thousands of them, several arrive every
 * month, and a stale list silently stops someone listing the phone they own — the one failure
 * a classifieds site cannot afford. So the stored value stays free text and this only
 * suggests, which means an unknown model costs the seller nothing.
 *
 * The names come from `prisma/data/taxonomy.json`, collected by
 * `scripts/taxonomy/fetch-taxonomy.mjs` from CarDekho, GSMArena and Wikipedia. Read once at
 * construction: it is 38 KB, it changes only when someone re-runs the collector, and a file
 * read per keystroke would be absurd.
 */
@Injectable()
export class ModelSuggestionsService {
  private readonly logger = new Logger(ModelSuggestionsService.name);

  /** Category slug to the section of the taxonomy that describes it. */
  private static readonly SECTION_FOR_SLUG: Record<string, string> = {
    vehicles: 'vehicles',
    cars: 'vehicles',
    'motorcycles-scooters': 'vehicles',
    'mobile-phones': 'MOBILE',
    'laptops-computers': 'LAPTOP',
    cameras: 'CAMERA',
  };

  private readonly taxonomy: Record<string, Record<string, string[]>>;

  constructor() {
    this.taxonomy = this.load();
  }

  private load(): Record<string, Record<string, string[]>> {
    // Resolved from this file so it works the same from `dist` and from ts-node, and
    // relative to the compiled location rather than the working directory — a script run
    // from the repository root must not read a different file from the server run from
    // `apps/api`.
    const path = join(__dirname, '..', '..', 'prisma', 'data', 'taxonomy.json');

    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      const out: Record<string, Record<string, string[]>> = {};

      for (const [section, brands] of Object.entries(parsed)) {
        if (section === 'sources' || typeof brands !== 'object' || brands === null) continue;
        out[section] = {};
        for (const [brand, models] of Object.entries(brands as Record<string, unknown>)) {
          if (Array.isArray(models)) out[section][brand] = models.filter((m) => typeof m === 'string');
        }
      }

      const total = Object.values(out).flatMap((b) => Object.values(b).flat()).length;
      this.logger.log(`Loaded ${total} model suggestions`);
      return out;
    } catch (error) {
      // Suggestions are a convenience, not a dependency. Losing them must not stop the API
      // starting: posting still works, because the field they help fill is free text.
      this.logger.warn(
        `No model suggestions available (${error instanceof Error ? error.message : String(error)})`,
      );
      return {};
    }
  }

  /**
   * Suggestions for a category, optionally narrowed by brand and by what has been typed.
   *
   * Without a brand this returns every model in the category, which is what an autocomplete
   * needs when the brand field has not been filled in yet — people often type "swift" before
   * they think about "Maruti".
   */
  suggest(categorySlug: string, options: { brand?: string; q?: string; limit?: number } = {}): string[] {
    const section = ModelSuggestionsService.SECTION_FOR_SLUG[categorySlug];
    const brands = section ? this.taxonomy[section] : undefined;
    if (!brands) return [];

    const pool = options.brand
      ? (brands[options.brand.toUpperCase()] ?? [])
      : [...new Set(Object.values(brands).flat())];

    const query = options.q?.trim().toLowerCase();
    const matched = query ? pool.filter((model) => model.toLowerCase().includes(query)) : pool;

    // A name that *starts* with what was typed is a better answer than one that merely
    // contains it: someone typing "i20" wants the i20, not the Grand i10 Nios.
    const ranked = query
      ? [...matched].sort((a, b) => {
          const byPrefix =
            Number(b.toLowerCase().startsWith(query)) - Number(a.toLowerCase().startsWith(query));
          return byPrefix !== 0 ? byPrefix : a.localeCompare(b);
        })
      : [...matched].sort((a, b) => a.localeCompare(b));

    return ranked.slice(0, Math.min(options.limit ?? 20, 50));
  }
}
