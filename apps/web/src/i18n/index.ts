import en from './messages/en.json';
import hi from './messages/hi.json';
import te from './messages/te.json';

export const LOCALES = ['en', 'te', 'hi'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  te: 'తెలుగు',
  hi: 'हिन्दी',
};

/**
 * English is the complete catalogue; Telugu and Hindi cover navigation and the key
 * user-facing flows. A missing key falls back to English rather than rendering the raw
 * key — a half-translated page is usable, a page full of `nav.home` is not.
 */
const MESSAGES: Record<Locale, unknown> = { en, te, hi };

type MessageValues = Record<string, string | number>;

function lookup(source: unknown, path: string[]): string | undefined {
  let current: unknown = source;
  for (const segment of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : undefined;
}

/** Replaces `{name}` placeholders. */
function interpolate(template: string, values?: MessageValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export type Translator = (key: string, values?: MessageValues) => string;

export function getTranslator(locale: Locale): Translator {
  const primary = MESSAGES[locale];
  const fallback = MESSAGES[DEFAULT_LOCALE];

  return (key, values) => {
    const path = key.split('.');
    const message = lookup(primary, path) ?? lookup(fallback, path);
    // Returning the key makes an untranslated string obvious in review rather than
    // silently rendering an empty element.
    return message ? interpolate(message, values) : key;
  };
}

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/** Picks the best supported locale from an Accept-Language header. */
export function negotiateLocale(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: tag!.split('-')[0]!.toLowerCase(), quality: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const entry of ranked) {
    if (isLocale(entry.tag)) return entry.tag;
  }
  return DEFAULT_LOCALE;
}
