#!/usr/bin/env node
/**
 * Filter and ordering semantics.
 *
 *   node scripts/acceptance-filters.mjs
 *
 * The other gates check that layers agree with each other. Two layers can agree and both
 * be wrong — a radius search that ignored a buyer's budget agreed perfectly with a page
 * that rendered everything it was given.
 *
 * So nothing here trusts the API's own answer. One unfiltered page is fetched, the
 * expected result of each filter is computed from it in plain JavaScript, and the API is
 * held to that. Every assertion is one of:
 *
 *   truth      — every returned listing genuinely satisfies the filter
 *   coverage   — nothing that should have matched is missing
 *   honesty    — `total` equals the number of listings that actually match
 *   order      — the sequence is exactly right, not merely the right set
 *
 * Compound queries get their own section, because that is where the defects were: each
 * filter worked alone, and a location plus a budget silently dropped the budget.
 */

const API = process.env.LOCZ_API ?? 'http://127.0.0.1:4000/api/v1';
const PINCODE = process.env.LOCZ_PINCODE ?? '500081';

let passed = 0;
let failed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}${detail ? `  ${detail}` : ''}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? `  ${detail}` : ''}`);
  }
}

function step(title) {
  console.log(`\n${title}`);
}

function backoffMs(response, body) {
  // Retry-After is what the server actually promised; the sentence in the body is a
  // fallback for a build that predates the header.
  const header = Number(response?.headers?.get?.('retry-after') ?? 0);
  const hinted = Number(/try again in (\d+) seconds/i.exec(body ?? '')?.[1] ?? 0);
  const seconds = header > 0 ? header : hinted;
  return Math.min(Math.max(seconds + 2, 11) * 1000, 360_000);
}

async function api(path, { token } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  let response = await fetch(`${API}${path}`, { headers });
  for (let attempt = 0; response.status === 429 && attempt < 4; attempt += 1) {
    const waitMs = backoffMs(response, await response.clone().text());
    console.log(`    (rate limited — waiting ${Math.round(waitMs / 1000)}s)`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await fetch(`${API}${path}`, { headers });
  }

  const text = await response.text();
  if (!response.ok) throw new Error(`GET ${path} → ${response.status}: ${text.slice(0, 200)}`);
  const payload = text ? JSON.parse(text) : null;
  return payload?.data ?? payload;
}

/**
 * Every expectation here is computed by enumerating a set, which only works while the set
 * fits on one page. A seeded database has fifty listings and a loaded one has fifty
 * thousand, so the suite narrows itself to a slice small enough to enumerate and applies
 * that slice to every query it makes.
 *
 * Scoping by pincode is deliberate rather than convenient: it means every assertion below
 * is a *compound* query — a location plus whatever is being tested — which is precisely
 * where the filters were being dropped.
 */
let scope = '';

function scoped(query) {
  return [scope, query].filter(Boolean).join('&');
}

async function browse(query) {
  const result = await api(`/listings?${scoped(query)}&limit=50`);
  return { items: result.items, total: result.meta.total };
}

/** An unscoped view, for the few checks that are about the whole database. */
async function browseAll(query) {
  const result = await api(`/listings?${query}&limit=50`);
  return { items: result.items, total: result.meta.total };
}

/**
 * Finds a slice that fits one page.
 *
 * Discovered rather than hardcoded: how listings are spread across the country depends on
 * the data in front of the suite, and a fixed list of "quiet" pincodes is a guess that
 * goes stale. Real codes are read from the API and probed at a tight radius until one
 * holds a handful of listings — few enough to enumerate, more than none.
 */
async function chooseScope() {
  const unscoped = await browseAll('');
  if (unscoped.items.length === unscoped.total) return '';

  const seen = new Set();
  for (const prefix of ['5000', '5001', '4000', '1100', '6000', '7000', '3800', '2260']) {
    const matches = await api(`/locations/pincodes?q=${prefix}&limit=20`);

    for (const pincode of matches) {
      if (seen.has(pincode.code)) continue;
      seen.add(pincode.code);

      const candidate = await browseAll(`pincode=${pincode.code}&radiusKm=1`);
      if (candidate.total > 0 && candidate.total <= 50) {
        return `pincode=${pincode.code}&radiusKm=1`;
      }
    }
  }

  throw new Error(
    `Probed ${seen.size} pincodes and none holds between 1 and 50 listings. This database ` +
      'is too uniformly dense to enumerate any slice of — widen the search in chooseScope().',
  );
}

async function main() {
  console.log(`LocZ filter semantics against ${API}`);

  // ---------------------------------------------------------------- 0. the universe
  step('0. The set every expectation is computed from');
  scope = await chooseScope();
  console.log(scope ? `  scoped to ${scope}` : '  small database — no scoping needed');

  const all = await browse('');
  check('listings available to reason about', all.items.length > 0, `${all.total} in scope`);
  check(
    'the scoped set fits one page',
    all.items.length === all.total,
    'so every expectation below can be exact',
  );

  // Condition is not on the summary, so it is read once per listing from the detail
  // endpoint — the same place a buyer reads it.
  const details = new Map();
  for (const item of all.items) {
    const detail = await api(`/listings/${item.slug}`);
    details.set(item.id, detail);
  }
  const conditionOf = (id) => details.get(id)?.marketplace?.condition ?? null;

  const priced = all.items.filter((item) => item.price !== null);
  check('some listings carry a price', priced.length > 0, `${priced.length} priced`);
  check(
    'some carry none',
    priced.length < all.items.length,
    `${all.items.length - priced.length} without a price`,
  );

  /**
   * Holds a query to a set computed here rather than to whatever the API returns.
   * `expected` is the list of ids that must come back — exactly, no more and no fewer.
   */
  async function expectSet(label, query, expected, { ordered = null } = {}) {
    const result = await browse(query);
    const returned = result.items.map((item) => item.id);
    const expectedIds = expected.map((item) => item.id);

    const missing = expectedIds.filter((id) => !returned.includes(id));
    const extra = returned.filter((id) => !expectedIds.includes(id));

    check(
      `${label} — returns exactly what matches`,
      missing.length === 0 && extra.length === 0,
      missing.length || extra.length
        ? `${missing.length} missing, ${extra.length} that should not match`
        : `${expectedIds.length} listings`,
    );

    // A total that disagrees with the page is how "1 result" comes back reading "11" —
    // the pagination lies even when the results are right.
    check(
      `${label} — total is honest`,
      result.total === expectedIds.length,
      `total ${result.total}, matches ${expectedIds.length}`,
    );

    if (ordered) {
      check(
        `${label} — in the right order`,
        JSON.stringify(returned) === JSON.stringify(ordered.map((item) => item.id)),
        returned.length ? `first: ${result.items[0]?.slug?.slice(0, 28)}` : 'empty',
      );
    }

    return result;
  }

  // ---------------------------------------------------------------- 1. single filters
  step('1. One filter at a time');

  const budget = 20_000;
  const underBudget = all.items.filter((item) => item.price !== null && item.price <= budget);
  check(
    'the price ceiling is a real test',
    underBudget.length > 0 && underBudget.length < all.items.length,
    `${underBudget.length} of ${all.items.length} under ₹${budget.toLocaleString('en-IN')}`,
  );
  await expectSet('price ceiling', `priceMax=${budget}`, underBudget);

  const floor = 20_000;
  const overFloor = all.items.filter((item) => item.price !== null && item.price >= floor);
  await expectSet('price floor', `priceMin=${floor}`, overFloor);

  const goodOnes = all.items.filter((item) => conditionOf(item.id) === 'GOOD');
  check(
    'the condition filter is a real test',
    goodOnes.length > 0 && goodOnes.length < all.items.length,
    `${goodOnes.length} of ${all.items.length} in good condition`,
  );
  await expectSet('condition', 'condition=GOOD', goodOnes);

  for (const type of ['PRODUCT', 'JOB', 'SERVICE', 'RENTAL', 'OFFER']) {
    const ofType = all.items.filter((item) => item.type === type);
    if (ofType.length === 0) continue;
    await expectSet(`type ${type}`, `type=${type}`, ofType);
  }

  // ---------------------------------------------------------------- 2. compound
  step('2. Filters combined — where the defects were');

  // Everything in the seeded city sits inside a 10 km radius of this pincode, so the
  // location narrows nothing on its own and any change must come from the other filter.
  const nearby = await (scope ? browse('') : browseAll(`pincode=${PINCODE}`));
  const inArea = new Set(nearby.items.map((item) => item.id));
  check('the pincode area is populated', inArea.size > 0, `${nearby.total} within 10 km`);

  const areaAndBudget = all.items.filter(
    (item) => inArea.has(item.id) && item.price !== null && item.price <= 5000,
  );
  check(
    'location plus budget is a real test',
    areaAndBudget.length < inArea.size,
    `${areaAndBudget.length} of ${inArea.size} under ₹5,000`,
  );
  await expectSet('location + price ceiling', 'priceMax=5000', areaAndBudget);

  const areaAndCondition = all.items.filter(
    (item) => inArea.has(item.id) && conditionOf(item.id) === 'GOOD',
  );
  await expectSet('location + condition', 'condition=GOOD', areaAndCondition);

  for (const type of ['JOB', 'PRODUCT']) {
    const areaAndType = all.items.filter((item) => inArea.has(item.id) && item.type === type);
    if (areaAndType.length === 0) continue;
    await expectSet(`location + type ${type}`, `type=${type}`, areaAndType);
  }

  const three = all.items.filter(
    (item) =>
      inArea.has(item.id) &&
      item.type === 'PRODUCT' &&
      item.price !== null &&
      item.price <= 20_000 &&
      conditionOf(item.id) === 'GOOD',
  );
  await expectSet(
    'location + type + price + condition',
    'type=PRODUCT&priceMax=20000&condition=GOOD',
    three,
  );

  // ---------------------------------------------------------------- 3. ordering
  step('3. Ordering is exact, not approximate');

  // Unpriced listings go last in both directions: a job has no price, and neither the
  // cheapest nor the dearest question has an answer for it.
  const ascResult = await browse('sort=price_asc');
  const ascPrices = ascResult.items.map((item) => item.price);
  check(
    'price ascending is monotonic',
    ascPrices
      .filter((price) => price !== null)
      .every((price, index, list) => index === 0 || list[index - 1] <= price),
    ascPrices
      .filter((price) => price !== null)
      .slice(0, 4)
      .join(' ≤ '),
  );
  check(
    'unpriced listings come last ascending',
    ascPrices.indexOf(null) === -1 || ascPrices.slice(ascPrices.indexOf(null)).every((p) => p === null),
    `${ascPrices.filter((p) => p === null).length} without a price`,
  );
  check(
    'ascending covers everything',
    ascResult.items.length === all.items.length,
    `${ascResult.items.length} of ${all.items.length}`,
  );

  const descResult = await browse('sort=price_desc');
  const descPrices = descResult.items.map((item) => item.price).filter((price) => price !== null);
  check(
    'price descending is monotonic',
    descPrices.every((price, index) => index === 0 || descPrices[index - 1] >= price),
    descPrices.slice(0, 4).join(' ≥ '),
  );
  check(
    'the dearest listing leads',
    descResult.items[0]?.price === Math.max(...priced.map((item) => item.price)),
    `₹${descResult.items[0]?.price?.toLocaleString('en-IN')}`,
  );

  const newest = await browse('sort=newest');
  const publishedTimes = newest.items.map((item) => new Date(item.publishedAt ?? 0).getTime());
  check(
    'newest is genuinely newest-first',
    publishedTimes.every((time, index) => index === 0 || publishedTimes[index - 1] >= time),
  );

  const popular = await browse('sort=popular');
  const views = popular.items.map((item) => item.viewCount);
  check(
    'popular is ordered by views',
    views.every((count, index) => index === 0 || views[index - 1] >= count),
    views.slice(0, 4).join(' ≥ '),
  );

  // Stated as a property rather than "the first one is featured": a small slice may
  // legitimately contain none, and an assertion that depends on the sample containing a
  // rarity is a flake waiting to happen. Every featured listing ahead of every ordinary
  // one is the actual rule, and it holds either way.
  const featuredFirst = await browseAll('');
  const lastFeatured = featuredFirst.items.map((item) => item.isFeatured).lastIndexOf(true);
  const firstOrdinary = featuredFirst.items.map((item) => item.isFeatured).indexOf(false);
  check(
    'the default view puts featured listings ahead of ordinary ones (distance wins inside a radius)',
    lastFeatured === -1 || firstOrdinary === -1 || lastFeatured < firstOrdinary,
    `${featuredFirst.items.filter((item) => item.isFeatured).length} featured in scope`,
  );

  // An explicit sort must survive a location filter — the same rule as featured placement.
  // The scope is already a radius search, so this only adds the sort — stacking a second
  // pincode parameter on top of it is a malformed request, not a stronger test.
  const nearbySorted = await browse('sort=price_asc');
  const nearbyPrices = nearbySorted.items.map((item) => item.price).filter((price) => price !== null);
  check(
    'an explicit sort survives a radius search',
    nearbyPrices.every((price, index) => index === 0 || nearbyPrices[index - 1] <= price),
    nearbyPrices.slice(0, 4).join(' ≤ '),
  );

  // ---------------------------------------------------------------- 4. pagination
  step('4. Pagination does not lose or repeat listings');

  const firstPage = await api(`/listings?${scoped('limit=3&page=1')}`);
  const secondPage = await api(`/listings?${scoped('limit=3&page=2')}`);
  const firstIds = firstPage.items.map((item) => item.id);
  const secondIds = secondPage.items.map((item) => item.id);

  check('page one is full', firstIds.length === 3, `${firstIds.length} listings`);
  check(
    'page two repeats nothing from page one',
    secondIds.every((id) => !firstIds.includes(id)),
  );
  check(
    'both pages report the same total',
    firstPage.meta.total === secondPage.meta.total,
    `${firstPage.meta.total}`,
  );
  check(
    'the total matches the unfiltered set',
    firstPage.meta.total === all.total,
    `${firstPage.meta.total} vs ${all.total}`,
  );

  const deepPage = await api(`/listings?${scoped('limit=3&page=99')}`);
  check('a page past the end is empty, not an error', deepPage.items.length === 0);
  check('and still reports the true total', deepPage.meta.total === all.total);

  // Paginating a radius search used to slice one list and count another.
  const nearbyPage = await api(`/listings?${scoped('limit=2&page=1')}`);
  const nearbyPageTwo = await api(`/listings?${scoped('limit=2&page=2')}`);
  check(
    'a paged radius search reports one consistent total',
    nearbyPage.meta.total === nearbyPageTwo.meta.total && nearbyPage.meta.total === nearby.total,
    `${nearbyPage.meta.total}`,
  );
  check(
    'and does not repeat a listing across its pages',
    nearbyPageTwo.items.every((item) => !nearbyPage.items.some((first) => first.id === item.id)),
  );

  // ---------------------------------------------------------------- 5. empty
  step('5. Nothing matching means nothing returned');

  const impossible = await browse('priceMax=1&type=PRODUCT');
  check('an impossible filter returns no listings', impossible.items.length === 0);
  check('and says so in the total', impossible.total === 0, `total ${impossible.total}`);

  const impossibleNearby = await browse('priceMax=1&type=PRODUCT');
  check(
    'the same holds inside a radius',
    impossibleNearby.items.length === 0 && impossibleNearby.total === 0,
    `total ${impossibleNearby.total}`,
  );

  // A distant pincode returns its own neighbourhood or nothing — never the database. The
  // guarantee is containment rather than emptiness: whether Srinagar holds eight listings
  // or none depends on the data, but every listing it returns must genuinely be within
  // the radius asked for.
  const remote = await browseAll('pincode=190001&radiusKm=1');
  const everything = await browseAll('');
  check(
    'a distant pincode returns its own area, not the database',
    remote.total < everything.total,
    `${remote.total} near 190001 of ${everything.total} in total`,
  );
  check(
    'and everything it returns is genuinely within the radius',
    remote.items.every((item) => item.distanceMeters === undefined || item.distanceMeters <= 1000),
    remote.items.length ? `farthest ${Math.max(...remote.items.map((item) => item.distanceMeters ?? 0))} m` : 'none nearby',
  );

  step('6. A keyword matches words, not fragments of them');

  // The defect this guards against: searching `car` returned an iPhone, because Meilisearch
  // prefix-matches the last query word and the phone's description said it had been
  // "carefully used for two years". Prefix matching is right for a title — `iph` should find
  // every iPhone — and wrong for 2000 characters of prose.
  //
  // Both paths are checked, because they fail differently. The index path is asked whether it
  // still finds real prefixes while rejecting coincidences. The database path is asked
  // whether it applies the keyword at all: it used to drop it silently, so an outage turned a
  // search for `car` into the entire catalogue presented as results.

  const search = async (q) => api(`/search?q=${encodeURIComponent(q)}&limit=5`);
  const listings = async (q) => api(`/listings?q=${encodeURIComponent(q)}&limit=5`);

  const carSearch = await search('car');
  check(
    'the index does not match a word fragment buried in a description',
    carSearch.total === 0,
    `"car" returned ${carSearch.total}${carSearch.items[0] ? `: ${carSearch.items[0].title}` : ''}`,
  );

  const prefixSearch = await search('iph');
  check(
    'but search-as-you-type still works on titles',
    prefixSearch.total > 0,
    `"iph" returned ${prefixSearch.total}`,
  );

  const wholeWord = await search('carefully');
  check(
    'and a whole word in a description is still a match',
    wholeWord.total > 0,
    `"carefully" returned ${wholeWord.total}`,
  );

  const carBrowse = await listings('car');
  const everythingBrowse = await listings('');
  check(
    'the database path applies the keyword rather than ignoring it',
    carBrowse.meta.total < everythingBrowse.meta.total,
    `"car" ${carBrowse.meta.total} vs ${everythingBrowse.meta.total} unfiltered`,
  );

  const wordStart = await listings('door');
  const wordMiddle = await listings('oor');
  check(
    'the database path matches the start of a word',
    wordStart.meta.total > 0,
    `"door" returned ${wordStart.meta.total}`,
  );
  check(
    'and not the middle of one',
    wordMiddle.meta.total === 0,
    `"oor" returned ${wordMiddle.meta.total}`,
  );

  // A keyword reaches PostgreSQL inside a LIKE pattern, where `%` and `_` are wildcards
  // rather than characters. Unescaped, searching for a single `%` returned every listing in
  // the database and made the planner scan the whole table to do it.
  const wildcard = await listings('%');
  check(
    'a percent sign is a character, not a wildcard matching everything',
    wildcard.meta.total < everythingBrowse.meta.total,
    `"%" returned ${wildcard.meta.total} of ${everythingBrowse.meta.total}`,
  );

  const underscore = await listings('_');
  check(
    'and an underscore does not match any single character',
    underscore.meta.total < everythingBrowse.meta.total,
    `"_" returned ${underscore.meta.total}`,
  );

  // Meilisearch's default strategy drops query terms from the end until something matches,
  // so it never answers "nothing". A nonsense hyphenated identifier came back with 12,377
  // listings, and `iphone 13 madhapur` came back with 4,171 by ignoring the last two words —
  // all presented as results for what the user typed. Every word has to count.
  const nonsense = 'no-such-local-item-03f5af74-e340-4115-8697-2ce2336094f6';
  const nonsenseSearch = await search(nonsense);
  const nonsenseBrowse = await listings(nonsense);
  check(
    'a nonsense query returns nothing rather than something',
    nonsenseSearch.total === 0,
    `index returned ${nonsenseSearch.total}`,
  );
  check(
    'and both paths agree that it matches nothing',
    nonsenseSearch.total === nonsenseBrowse.meta.total,
    `index ${nonsenseSearch.total}, database ${nonsenseBrowse.meta.total}`,
  );

  const narrow = await search('excellent condition');
  const broad = await search('excellent');
  check(
    'adding a word narrows the results rather than being ignored',
    narrow.total <= broad.total,
    `"excellent" ${broad.total} → "excellent condition" ${narrow.total}`,
  );

  step('7. Every page the API promises actually has something on it');

  // Meilisearch stops at `maxTotalHits` however many documents matched. The count came from
  // the match and the results came from the ceiling, so a search reporting 4,117 results went
  // blank after page 100 and offered a hundred empty pages after it — and the same query
  // served from the database, which has no ceiling, kept returning rows. Whether result 2,001
  // existed depended on whether the search index happened to be up.
  //
  // Stated as a rule rather than as a number: the last page a total implies must not be empty.
  // That holds whichever path answered and whatever the ceiling is changed to later.

  const pageSize = 20;

  for (const [label, path] of [
    ['the index path', '/search?q=fridge&sort=price_asc'],
    ['the database path', '/listings?q=fridge'],
  ]) {
    const first = await api(`${path}&limit=${pageSize}&page=1`);
    const total = first.total ?? first.meta.total;
    const lastPage = Math.ceil(total / pageSize);

    if (lastPage <= 1) {
      check(`${label} advertises a reachable last page`, true, 'single page');
      continue;
    }

    const last = await api(`${path}&limit=${pageSize}&page=${lastPage}`);
    const items = last.items ?? [];
    check(
      `${label} can serve the last page it advertises`,
      items.length > 0,
      `${total} results implies page ${lastPage}, which returned ${items.length}`,
    );
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailed:');
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nFilter semantics run aborted: ${error.message}`);
  process.exitCode = 1;
});
