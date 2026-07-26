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

/** Browse (no keyword) — the path where the compound-filter defects lived. */
async function browse(query) {
  const result = await api(`/listings?${query}&limit=50`);
  return { items: result.items, total: result.meta.total };
}

async function main() {
  console.log(`LocZ filter semantics against ${API}`);

  // ---------------------------------------------------------------- 0. the universe
  step('0. The set every expectation is computed from');
  const all = await browse('');
  check('published listings available', all.items.length > 0, `${all.total} listings`);
  check('the whole set fits one page', all.items.length === all.total, 'expectations stay exact');

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
  const nearby = await browse(`pincode=${PINCODE}`);
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
  await expectSet('pincode + price ceiling', `pincode=${PINCODE}&priceMax=5000`, areaAndBudget);

  const areaAndCondition = all.items.filter(
    (item) => inArea.has(item.id) && conditionOf(item.id) === 'GOOD',
  );
  await expectSet('pincode + condition', `pincode=${PINCODE}&condition=GOOD`, areaAndCondition);

  for (const type of ['JOB', 'PRODUCT']) {
    const areaAndType = all.items.filter((item) => inArea.has(item.id) && item.type === type);
    if (areaAndType.length === 0) continue;
    await expectSet(`pincode + type ${type}`, `pincode=${PINCODE}&type=${type}`, areaAndType);
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
    'pincode + type + price + condition',
    `pincode=${PINCODE}&type=PRODUCT&priceMax=20000&condition=GOOD`,
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

  const featuredFirst = await browse('');
  check(
    'the default view leads with featured listings',
    featuredFirst.items[0]?.isFeatured === true,
    featuredFirst.items[0]?.slug?.slice(0, 30),
  );

  // An explicit sort must survive a location filter — the same rule as featured placement.
  const nearbySorted = await browse(`pincode=${PINCODE}&sort=price_asc`);
  const nearbyPrices = nearbySorted.items.map((item) => item.price).filter((price) => price !== null);
  check(
    'an explicit sort survives a radius search',
    nearbyPrices.every((price, index) => index === 0 || nearbyPrices[index - 1] <= price),
    nearbyPrices.slice(0, 4).join(' ≤ '),
  );

  // ---------------------------------------------------------------- 4. pagination
  step('4. Pagination does not lose or repeat listings');

  const firstPage = await api('/listings?limit=3&page=1');
  const secondPage = await api('/listings?limit=3&page=2');
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

  const deepPage = await api('/listings?limit=3&page=99');
  check('a page past the end is empty, not an error', deepPage.items.length === 0);
  check('and still reports the true total', deepPage.meta.total === all.total);

  // Paginating a radius search used to slice one list and count another.
  const nearbyPage = await api(`/listings?pincode=${PINCODE}&limit=2&page=1`);
  const nearbyPageTwo = await api(`/listings?pincode=${PINCODE}&limit=2&page=2`);
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

  const impossibleNearby = await browse(`pincode=${PINCODE}&priceMax=1&type=PRODUCT`);
  check(
    'the same holds inside a radius',
    impossibleNearby.items.length === 0 && impossibleNearby.total === 0,
    `total ${impossibleNearby.total}`,
  );

  const emptyArea = await browse('pincode=190001');
  check(
    'a pincode with nothing nearby returns nothing, not everything',
    emptyArea.items.length === 0 && emptyArea.total === 0,
    `total ${emptyArea.total} in 190001`,
  );

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
