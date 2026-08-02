/**
 * Words that carry no meaning in a local search, and must not be required to match.
 *
 * Shared by the listings and business indexes rather than copied into each. A user cannot
 * tell which index answered them, so any difference in which words are ignored would read as
 * the search behaving unpredictably.
 *
 * These exist because `matchingStrategy: all` requires every query word to appear — which is
 * right, and stopped "iphone 13 madhapur" returning 4,171 listings by ignoring two of the
 * three words. But it also meant "best biryani near me" returned nothing, because no listing
 * contains "best", "near" or "me". That is how people type, and answering the most natural
 * phrasing with an empty page is worse than either problem. Removing these before matching
 * fixes it without weakening the rule: every word that survives still has to mean something.
 *
 * Hindi and Telugu equivalents included, because the sentence shape is the same in all three.
 */
export const SEARCH_STOP_WORDS = [
  'a', 'an', 'the', 'in', 'at', 'on', 'of', 'for', 'to', 'and', 'or',
  'is', 'are', 'my', 'me', 'i', 'we', 'you',
  'near', 'nearby', 'around', 'close', 'closest', 'nearest',
  'best', 'good', 'top', 'cheap', 'cheapest', 'low', 'price',
  'here', 'this', 'that', 'any', 'some', 'available', 'need', 'want', 'looking',
  'shop', 'shops', 'place', 'places',
  'పక్కన', 'దగ్గర', 'నాకు', 'కావాలి', 'మంచి',
  'पास', 'नजदीक', 'मुझे', 'चाहिए', 'अच्छा', 'सबसे',
];
