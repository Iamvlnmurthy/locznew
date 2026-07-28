#!/usr/bin/env node
/**
 * Smoke gate that runs against the *deployed* site, through the real reverse proxy.
 *
 * Every other browser gate drives a locally started Next server, where there is no proxy in
 * front. That gap let a production outage through: OpenLiteSpeed forwards `Origin` twice,
 * Node joins repeated headers with `", "`, and Next parses that value as a URL when it
 * validates a Server Action — so it threw `TypeError: Invalid URL` before running any of its
 * own checks. Ordinary page loads were untouched, so the site looked healthy and every gate
 * passed while *no Server Action on the site worked at all*. The visible symptom was that
 * choosing an area did nothing and the homepage kept showing the fallback city.
 *
 * The lesson is narrow and worth encoding: a class of failure lives in the hop between the
 * proxy and the app, and it is invisible to anything that skips that hop. So this gate is
 * deliberately not a second copy of the feature suites — it exercises the paths whose failure
 * mode is silent, against the real origin, and refuses to run anywhere else.
 *
 *   LOCZ_WEB=https://locz.in node scripts/acceptance-deployed.mjs
 */

import { CdpBrowser } from './acceptance-browser.mjs';

const WEB = process.env.LOCZ_WEB ?? '';
const AREAS = [
  { pincode: '500081', city: 'Hyderabad' },
  { pincode: '110001', city: 'Delhi' },
];

let passed = 0;

function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  passed += 1;
  console.log(`  ✓ ${label}${detail ? `  ${detail}` : ''}`);
}

/**
 * A localhost run would pass while telling us nothing, which is worse than not running: it
 * reports green for exactly the hop this gate exists to cover.
 */
function requireDeployedOrigin() {
  if (!WEB) {
    throw new Error('LOCZ_WEB is required, e.g. LOCZ_WEB=https://locz.in');
  }
  const { protocol, hostname } = new URL(WEB);
  if (protocol !== 'https:' || hostname === 'localhost' || hostname === '127.0.0.1') {
    throw new Error(
      `LOCZ_WEB must be the deployed https origin; got ${WEB}. This gate covers the proxy hop, ` +
        'so pointing it at a local server would report a pass for the one thing it checks.',
    );
  }
}

/** Drives the area picker, which posts a Server Action — the path that silently 500'd. */
async function chooseArea(browser, pincode) {
  await browser.navigate('/location');
  await browser.fill('#pincode', pincode);
  await browser.waitFor(
    `Boolean([...document.querySelectorAll('button')].find((b) => /Show ads near/i.test(b.textContent)))`,
    `${pincode} resolves to a confirmable area`,
    20_000,
  );
  await browser.evaluate(
    `[...document.querySelectorAll('button')].find((b) => /Show ads near/i.test(b.textContent)).click()`,
  );

  // The picker reports an unresolvable pincode as a typo, which is right for a real typo and
  // badly misleading for a build that cannot reach the API at all — a `NEXT_PUBLIC_API_BASE_URL`
  // missing at build time inlines a localhost default, and then every real pincode "looks
  // wrong". Naming that here turns a blank timeout into the actual diagnosis.
  const rejected = await browser.evaluate(
    `[...document.querySelectorAll('.location-picker p, [role=alert]')].some((n) => /does not look right/i.test(n.textContent))`,
  );
  if (rejected) {
    throw new Error(
      `the deployed build rejected ${pincode}, a pincode the API resolves. The usual cause is a ` +
        'build that could not see NEXT_PUBLIC_API_BASE_URL and inlined the localhost default.',
    );
  }
  // The action sets the area cookie and redirects home. Waiting on the destination rather
  // than a fixed delay is what distinguishes "it worked" from "it threw and stayed put".
  await browser.waitFor(
    `new URL(location.href).pathname === '/'`,
    `${pincode} submission leaves /location`,
    30_000,
  );
}

const chipText = `document.querySelector('.location-chip')?.textContent?.trim() ?? ''`;

async function mobileHeaderState(browser) {
  return browser.evaluate(`(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const brand = rect('.header__brand');
    const location = rect('.location-chip');
    const theme = rect('.theme-toggle--mobile');
    const search = rect('.header__row > .searchbar');
    const label = document.querySelector('.location-chip > span:first-of-type');

    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      compactBrand: Boolean(brand) && brand.width <= 48,
      readableLocation: Boolean(label) &&
        getComputedStyle(label).display !== 'none' &&
        label.getBoundingClientRect().width > 20,
      controlsShareFirstRow: [brand, location, theme].every(Boolean) &&
        Math.max(brand.top, location.top, theme.top) <
          Math.min(brand.bottom, location.bottom, theme.bottom),
      searchUsesSecondRow: Boolean(search) &&
        search.top >= Math.max(brand?.bottom ?? 0, location?.bottom ?? 0, theme?.bottom ?? 0),
      searchFitsViewport: Boolean(search) && search.left >= 0 && search.right <= innerWidth,
    };
  })()`);
}

async function main() {
  requireDeployedOrigin();
  console.log(`Deployed smoke gate against ${WEB}`);

  const browser = new CdpBrowser();
  try {
    await browser.start();
    await browser.viewport(1280, 900);

    await browser.navigate('/');
    check(
      'the deployed homepage renders',
      await browser.evaluate(`Boolean(document.querySelector('main'))`),
    );

    // Production once served a stale final CSS chunk that overrode the corrected responsive
    // header. There was no horizontal overflow, so the generic viewport gate stayed green
    // while the location became an unexplained icon and search was crushed into one row.
    await browser.viewport(430, 900);
    const mobileHeader = await mobileHeaderState(browser);
    check('the deployed mobile header has no overflow', mobileHeader.overflow <= 1);
    check('the deployed mobile brand uses its compact hitbox', mobileHeader.compactBrand);
    check('the deployed mobile location remains readable', mobileHeader.readableLocation);
    check(
      'the deployed mobile header keeps identity controls on the first row',
      mobileHeader.controlsShareFirstRow,
    );
    check('the deployed mobile search owns the second row', mobileHeader.searchUsesSecondRow);
    check('the deployed mobile search fits the viewport', mobileHeader.searchFitsViewport);
    await browser.viewport(1280, 900);

    for (const { pincode, city } of AREAS) {
      await chooseArea(browser, pincode);

      const chip = await browser.evaluate(chipText);
      check(
        `choosing ${pincode} (${city}) takes effect`,
        chip.includes(pincode),
        `chip=${JSON.stringify(chip)}`,
      );

      // A reload proves the action persisted the choice rather than only updating the client:
      // the original bug left the server none the wiser, so the fallback city came back.
      await browser.navigate('/');
      const afterReload = await browser.evaluate(chipText);
      check(
        `${pincode} survives a reload`,
        afterReload.includes(pincode),
        `chip=${JSON.stringify(afterReload)}`,
      );
    }

    // Switching between the two areas has to actually move the feed, otherwise the picker is
    // decorative — which is precisely how the outage read to the user.
    const heading = await browser.evaluate(
      `[...document.querySelectorAll('h1, h2')].map((h) => h.textContent.trim()).find((t) => t.includes('around')) ?? ''`,
    );
    check(
      'the feed follows the chosen area',
      heading === '' || !heading.includes(AREAS[0].city),
      `heading=${JSON.stringify(heading)}; chose ${AREAS[1].pincode}`,
    );

    // Recent searches are intentionally device-local. Seed the browser store rather than
    // inventing a server fixture, then prove the deployed input can expose and clear it.
    await chooseArea(browser, AREAS[0].pincode);
    await browser.navigate('/search');
    await browser.evaluate(
      `localStorage.setItem('locz.recent-searches.v1', JSON.stringify(['acceptance bicycle']))`,
    );
    // The empty results search intentionally autofocuses. Calling `.focus()` again does
    // not dispatch a focus event, so the component has no reason to re-read the history
    // that this gate seeded after mount. A click is the real returning-user interaction
    // and fires even when the field already owns focus.
    await browser.click('#results-search');
    await browser.waitFor(
      `Boolean(document.querySelector('.recent-search__menu'))`,
      'recent searches open below an empty focused search field',
    );
    check(
      'the deployed search shows device-local recent searches',
      await browser.evaluate(
        `document.querySelector('.recent-search__menu')?.textContent.includes('acceptance bicycle')`,
      ),
    );
    await browser.evaluate(`document.querySelector('.recent-search__heading button').click()`);
    check(
      'recent searches can be cleared without an API',
      await browser.evaluate(
        `localStorage.getItem('locz.recent-searches.v1') === null && !document.querySelector('.recent-search__menu')`,
      ),
    );

    // Use a real public listing to cover both explicit WhatsApp sharing and the privacy
    // boundary: its outgoing text has exactly an introduction plus the canonical URL. It
    // never serialises the seller object or a phone field.
    const adPath = await browser.evaluate(
      `document.querySelector('a[href^="/ad/"]')?.getAttribute('href') ?? ''`,
    );
    check('the deployed search exposes a public listing for share verification', Boolean(adPath));
    await browser.navigate(adPath);
    const whatsAppShare = await browser.evaluate(`(() => {
      const link = document.querySelector('a[href^="https://wa.me/?text="]');
      if (!link) return null;
      const text = new URL(link.href).searchParams.get('text') ?? '';
      const lines = text.split('\\n');
      return {
        lines,
        canonical: lines.length === 2 &&
          lines[1] === location.origin + location.pathname &&
          /^\\/ad\\//.test(location.pathname),
      };
    })()`);
    check('the deployed listing has an explicit WhatsApp share action', Boolean(whatsAppShare));
    check(
      'shared text contains only the introduction and canonical listing URL',
      whatsAppShare?.canonical,
      JSON.stringify(whatsAppShare?.lines ?? []),
    );

    check(
      'no server error on any request',
      browser.httpErrors.length === 0,
      browser.httpErrors.join(' | '),
    );
    check('no browser console errors', browser.errors.length === 0, browser.errors.join(' | '));

    console.log(`\nDeployed smoke gate passed (${passed} checks)`);
  } finally {
    browser.close();
  }
}

main().catch((error) => {
  console.error(`\nDeployed smoke gate failed: ${error.message}`);
  process.exitCode = 1;
});
