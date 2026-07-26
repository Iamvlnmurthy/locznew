#!/usr/bin/env node
/**
 * Translation coverage.
 *
 *   npm run check:i18n
 *
 * The brief asks for English, Telugu and Hindi. The catalogue had quietly drifted to 36% on
 * the other two, and nothing looked broken — a missing key falls back to English rather
 * than rendering `nav.home`, so a Telugu speaker simply met English at sign-in and again
 * when posting an advert. Those are the two things nobody can avoid doing.
 *
 * Silent fallback is the right runtime behaviour and precisely why this check has to exist:
 * the failure it guards against is invisible by design. Needs no running stack, so it can
 * sit in the ordinary test path rather than behind a live-stack flag.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const messages = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'src', 'i18n', 'messages');

/** The product name is the same word in every language. */
const NOT_TRANSLATED = new Set(['brand.name']);

function flatten(source, prefix = '') {
  const flat = {};
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') Object.assign(flat, flatten(value, path));
    else flat[path] = String(value);
  }
  return flat;
}

function load(locale) {
  return flatten(JSON.parse(readFileSync(join(messages, `${locale}.json`), 'utf8')));
}

const english = load('en');
let failures = 0;

function check(label, offenders) {
  if (offenders.length === 0) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.log(`  ✗ ${label} — ${offenders.length}`);
  for (const offender of offenders.slice(0, 8)) console.log(`      ${offender}`);
  if (offenders.length > 8) console.log(`      … and ${offenders.length - 8} more`);
}

console.log(`Translation coverage — ${Object.keys(english).length} keys in English\n`);

for (const locale of ['te', 'hi']) {
  const strings = load(locale);
  console.log(`${locale}:`);

  check(
    'has every key English has',
    Object.keys(english).filter((key) => !(key in strings)),
  );

  // Present but identical reads as covered in any count, and reads as English on the page.
  check(
    'is translated rather than copied',
    Object.keys(english).filter((key) => !NOT_TRANSLATED.has(key) && strings[key] === english[key]),
  );

  // A dropped placeholder is worse than a missing translation: the interpolator leaves the
  // literal text, so the reader sees "{city}".
  check(
    'keeps every placeholder intact',
    Object.keys(english).filter((key) => {
      const expected = [...english[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
      const actual = [...(strings[key] ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
      return expected !== actual;
    }),
  );

  // An orphan is dead weight, or a key translated after being renamed in English — in
  // which case the page still shows the fallback.
  check(
    'adds no keys English does not have',
    Object.keys(strings).filter((key) => !(key in english)),
  );

  console.log('');
}

if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('Every locale is complete.');
}
