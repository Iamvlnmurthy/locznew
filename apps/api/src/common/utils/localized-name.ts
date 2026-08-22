/**
 * The name of a thing in the language the page is being served in.
 *
 * Category and city names are the two pieces of English that appear in the title, the meta
 * description and the composed description of every business profile. Served at /te and /hi
 * they made those pages translated furniture around English content — unreadable to the
 * reader it was translated for, and thin duplicate content to a search engine.
 *
 * Falls back to English whenever a translation is missing rather than showing an empty
 * string, because 640 cities have only 8 Telugu names so far and a blank city is worse than
 * an English one.
 */
export type Localizable = {
  name: string;
  nameTe?: string | null;
  nameHi?: string | null;
};

export function localizedName(value: Localizable, lang?: string | null): string {
  switch (lang?.toLowerCase()) {
    case 'te':
      return value.nameTe?.trim() || value.name;
    case 'hi':
      return value.nameHi?.trim() || value.name;
    default:
      return value.name;
  }
}
