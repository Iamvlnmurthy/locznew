/**
 * SEO regression check for representative entity pages.
 *
 * A change to the business template touches 2.9 million URLs, and today three
 * separate faults shipped that a green build could not see: a banner behind a
 * scrim, a name clipped off the top of a phone, and an AdSense tag that never
 * reached the HTML. This asserts the things a crawler actually reads.
 *
 *   node scripts/ui-verify/seo-check.mjs                 # against production
 *   node scripts/ui-verify/seo-check.mjs http://localhost:3000
 *
 * Exit code is 1 if any check fails, so it can gate a deploy.
 */
const BASE = process.argv[2] || 'https://locz.in';

// One per template shape, chosen so a category-specific regression surfaces.
const PAGES = [
  ['dental clinic', '/b/finedent-dental-clinics-003b-453g'],
  ['theme restaurant', '/b/747-theme-restaurant-000c-txth'],
  ['home developer', '/b/arcon-home-developers-002j-48a1'],
  ['IT services', '/b/sparkle-homes-001d-155y'],
  ['home page', '/'],
  ['sitemap index', '/sitemap-businesses.xml'],
];

const failures = [];
const check = (page, name, ok, detail = '') => {
  if (!ok) failures.push(`${page}: ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

const jsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter(Boolean);

for (const [label, path] of PAGES) {
  const url = BASE + path;
  let res, html;
  try {
    res = await fetch(url, { redirect: 'follow' });
    html = await res.text();
  } catch (error) {
    failures.push(`${label}: unreachable — ${error.message}`);
    continue;
  }

  check(label, 'HTTP 200', res.status === 200, `got ${res.status}`);

  if (path.endsWith('.xml')) {
    check(label, 'is a sitemap index', html.includes('<sitemapindex'));
    check(label, 'has shards', (html.match(/<sitemap>/g) || []).length > 0);
    continue;
  }

  // Every page, including the home page.
  check(label, 'has a title', /<title>[^<]{10,}/.test(html));
  check(label, 'exactly one H1', (html.match(/<h1[\s>]/g) || []).length === 1,
    `found ${(html.match(/<h1[\s>]/g) || []).length}`);
  check(label, 'not noindex', !/<meta name="robots"[^>]*noindex/i.test(html));
  // The verifier reads HTML, so this must be a real tag and not a preload.
  check(label, 'AdSense script tag present',
    /<script[^>]+src="https:\/\/pagead2\.googlesyndication\.com[^"]*"/.test(html));

  if (!path.startsWith('/b/')) continue;

  check(label, 'self-canonical', html.includes(`rel="canonical" href="${BASE}${path}"`));
  check(label, 'meta description', /<meta name="description" content="[^"]{50,}/.test(html));

  const blocks = jsonLd(html);
  const entity = blocks.find((b) => b['@type'] && b['@type'] !== 'BreadcrumbList'
    && b['@type'] !== 'FAQPage' && b['@type'] !== 'ItemList');
  check(label, 'entity JSON-LD', Boolean(entity));
  if (entity) {
    check(label, 'has address', Boolean(entity.address));
    check(label, 'has geo', Boolean(entity.geo));
    // These are the ones that must never appear without real data behind them.
    check(label, 'no invented rating', !('aggregateRating' in entity));
    check(label, 'no invented reviews', !('review' in entity));
  }
  check(label, 'BreadcrumbList', blocks.some((b) => b['@type'] === 'BreadcrumbList'));

  // Critical content must be server-rendered, not fetched by the client.
  check(label, 'address in HTML', /business-profile-identity__address/.test(html));

  // The regression this suite was written after: boilerplate on every page.
  for (const phrase of ['Nothing published right now', 'Hours not added yet']) {
    const visible = new RegExp(`>\s*${phrase}`).test(html);
    check(label, `no "${phrase}" rendered`, !visible);
  }
}

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s)\n`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`PASS — ${PAGES.length} pages checked against ${BASE}`);
