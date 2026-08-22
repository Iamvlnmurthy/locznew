import type { Locale } from '@/i18n';

/**
 * The name of a category, city or filter option in the language the page is being served in.
 *
 * There were three near-identical copies of this before — in `c/[slug]`, in `post-form` and
 * in `search-filters` — and they disagreed in a way that mattered: two used `||`, one used
 * `??`. `??` keeps an empty-string translation, which renders a blank where a name should
 * be. This uses `||`, so an empty or whitespace-only translation falls through to English.
 *
 * Falling back to English is the common path, not an edge case. All 183 categories are
 * translated, but only 8 of 640 cities are, and localities have no translations at all. An
 * English city name inside a Telugu sentence is imperfect; a blank one is broken.
 */
export function localizedName(
  value: {
    name?: string | null;
    nameTe?: string | null;
    nameHi?: string | null;
    label?: string | null;
    labelTe?: string | null;
    labelHi?: string | null;
  },
  locale: Locale | string,
): string {
  const fallback = value.name || value.label || '';
  if (locale === 'te') return value.nameTe?.trim() || value.labelTe?.trim() || fallback;
  if (locale === 'hi') return value.nameHi?.trim() || value.labelHi?.trim() || fallback;
  return fallback;
}
