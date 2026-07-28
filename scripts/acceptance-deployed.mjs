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
  // The action sets the area cookie and redirects home. Waiting on the destination rather
  // than a fixed delay is what distinguishes "it worked" from "it threw and stayed put".
  await browser.waitFor(
    `new URL(location.href).pathname === '/'`,
    `${pincode} submission leaves /location`,
    30_000,
  );
}

const chipText = `document.querySelector('.location-chip')?.textContent?.trim() ?? ''`;

async function main() {
  requireDeployedOrigin();
  console.log(`Deployed smoke gate against ${WEB}`);

  const browser = new CdpBrowser();
  try {
    await browser.start();
    await browser.viewport(1280, 900);

    await browser.navigate('/');
    check('the deployed homepage renders', await browser.evaluate(`Boolean(document.querySelector('main'))`));

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

    check(
      'no server error on any request',
      browser.httpErrors.length === 0,
      browser.httpErrors.join(' | '),
    );
    check(
      'no browser console errors',
      browser.errors.length === 0,
      browser.errors.join(' | '),
    );

    console.log(`\nDeployed smoke gate passed (${passed} checks)`);
  } finally {
    browser.close();
  }
}

main().catch((error) => {
  console.error(`\nDeployed smoke gate failed: ${error.message}`);
  process.exitCode = 1;
});
