#!/usr/bin/env node
/**
 * Collects brand and model names for the categories where the *model* is what people filter
 * by: vehicles, phones, cameras and laptops.
 *
 * Deliberately not every category. For appliances, televisions, furniture and fashion the
 * model number is not how anyone shops — nobody searches for a "Whirlpool WDE205 CLS 3S",
 * they search for a 1.5 ton five-star split AC from a brand they trust. Those categories get
 * a curated brand list and spec attributes in the seed instead, which is both more useful and
 * something no amount of scraping would improve.
 *
 * Sources, and why these two:
 *
 *   CarDekho     — vehicles. India-market, which is the whole point. Its `robots.txt` allows
 *                  the model pages used here, and the names arrive in an embedded JSON
 *                  payload rather than needing the page rendered.
 *   Wikipedia    — consumer electronics, via the official API under CC BY-SA. Model articles
 *                  are titled by model, so `list=allpages` with a brand prefix enumerates
 *                  them directly.
 *
 * Sources deliberately not used, each checked rather than assumed:
 *
 *   Wikidata     — empty for this. Five Hyundai models and one phone released since 2021.
 *   data.gov.in  — real and open, but its vehicle datasets are registration *counts* by
 *                  category, with no maker or model column.
 *   NHTSA vPIC   — comprehensive and public domain, but US-market: "Suzuki" returns Bandit
 *                  and Intruder, never Swift or Alto.
 *   OLX          — does not answer requests from this network at all.
 *   Smartprix    — 403s automated clients even though its `robots.txt` permits these paths.
 *                  Presenting a browser's identity to get past that would be circumventing
 *                  an access control, which is a different thing from honouring robots.txt.
 *
 * Output is JSON on stdout, or to --out. Nothing here writes to the database: seeding is a
 * migration's job, and a scrape that edits production directly is one bad parse away from
 * replacing a working taxonomy with rubbish.
 *
 *   node scripts/taxonomy/fetch-taxonomy.mjs --out apps/api/prisma/data/taxonomy.json
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// ASCII only. An HTTP header cannot carry a non-Latin-1 character, and an em dash here
// made every single request throw before it was sent.
const UA = 'LocZ-taxonomy/1.0 (+https://locz.in) building category filters; contact via site';

/** Politeness gap between requests to one host. Neither source is being paid to serve us. */
const DELAY_MS = 900;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries a 429 with a widening gap, and gives up rather than grinding on.
 *
 * A 429 is the site asking us to slow down. Ignoring it and retrying at the same rate is how
 * a polite crawler becomes an abusive one, and how an IP gets blocked for everyone. GSMArena
 * starts returning them partway through a full run, which is entirely reasonable of it.
 */
async function fetchText(url, accept = 'text/html') {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, {
      headers: { 'user-agent': UA, accept },
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) return response.text();
    if (response.status !== 429 || attempt >= 3) {
      throw new Error(`${response.status} for ${url}`);
    }

    const wait = Number(response.headers.get('retry-after')) * 1000 || (attempt + 1) * 15_000;
    console.error(`    429, waiting ${Math.round(wait / 1000)}s`);
    await delay(wait);
  }
}

// ---------------------------------------------------------------- vehicles

/**
 * CarDekho slugs, which are not always the brand name: Maruti Suzuki lives at `/cars/Maruti`.
 * Listed explicitly so a wrong guess fails loudly instead of silently returning nothing.
 */
const CAR_BRANDS = [
  ['MARUTI_SUZUKI', 'Maruti', 'Maruti Suzuki'],
  ['HYUNDAI', 'Hyundai', 'Hyundai'],
  ['TATA', 'Tata', 'Tata'],
  ['MAHINDRA', 'Mahindra', 'Mahindra'],
  ['TOYOTA', 'Toyota', 'Toyota'],
  ['HONDA', 'Honda', 'Honda'],
  ['KIA', 'Kia', 'Kia'],
  ['MG', 'MG', 'MG'],
  ['RENAULT', 'Renault', 'Renault'],
  ['NISSAN', 'Nissan', 'Nissan'],
  ['SKODA', 'Skoda', 'Skoda'],
  ['VOLKSWAGEN', 'Volkswagen', 'Volkswagen'],
  ['FORD', 'Ford', 'Ford'],
  ['JEEP', 'Jeep', 'Jeep'],
  ['CITROEN', 'Citroen', 'Citroen'],
  ['MERCEDES_BENZ', 'Mercedes-Benz', 'Mercedes-Benz'],
  ['BMW', 'BMW', 'BMW'],
  ['AUDI', 'Audi', 'Audi'],
  ['VOLVO', 'Volvo', 'Volvo'],
  ['LAND_ROVER', 'Land-Rover', 'Land Rover'],
  ['JAGUAR', 'Jaguar', 'Jaguar'],
  ['LEXUS', 'Lexus', 'Lexus'],
  ['ISUZU', 'Isuzu', 'Isuzu'],
  ['FIAT', 'Fiat', 'Fiat'],
  ['DATSUN', 'Datsun', 'Datsun'],
  ['CHEVROLET', 'Chevrolet', 'Chevrolet'],
  ['BYD', 'BYD', 'BYD'],
  ['FORCE', 'Force', 'Force'],
];

/**
 * Both the on-sale and the discontinued page.
 *
 * A used-goods marketplace needs the discontinued ones most: nobody sells a car the year it
 * launches, and the Alto 800 and Zen are exactly what turns up on a classifieds site. A list
 * of only current models would reject the majority of real sellers.
 */
async function carModels() {
  const byBrand = {};

  for (const [value, slug, label] of CAR_BRANDS) {
    const found = new Set();

    for (const path of [`/cars/${slug}`, `/cars/${slug}/discontinued`]) {
      try {
        const html = await fetchText(`https://www.cardekho.com${path}`);
        for (const match of html.matchAll(/"modelName"\s*:\s*"([^"]{2,60})"/g)) {
          const name = match[1].trim();
          // The page carries recommendations from other brands too, so keep only what
          // belongs to the brand we asked for.
          if (name.toLowerCase().startsWith(label.toLowerCase())) {
            found.add(name.slice(label.length).trim());
          }
        }
      } catch (error) {
        console.error(`  ! ${label} ${path}: ${error.message}`);
      }
      await delay(DELAY_MS);
    }

    byBrand[value] = [...found].filter(Boolean).sort();
    console.error(`  ${label.padEnd(16)} ${byBrand[value].length} models`);
  }

  return byBrand;
}

// ------------------------------------------------------------- electronics

const WIKI_BRANDS = {
  CAMERA: [
    ['CANON', 'Canon EOS'],
    ['NIKON', 'Nikon D'],
    ['SONY', 'Sony Alpha'],
    ['FUJIFILM', 'Fujifilm X'],
    ['GOPRO', 'GoPro'],
  ],
  LAPTOP: [
    ['APPLE', 'MacBook'],
    ['DELL', 'Dell XPS'],
    ['LENOVO', 'ThinkPad'],
    ['HP', 'HP Pavilion'],
    ['ASUS', 'Asus ZenBook'],
  ],
};

/** Article titles that are not models: indexes, disambiguation, the brand page itself. */
const NOT_A_MODEL = /\((?:disambiguation|company|brand)\)|^list of|^comparison of|^history of/i;

async function wikipediaModels(prefix) {
  const titles = [];
  let cursor;

  do {
    const params = new URLSearchParams({
      format: 'json',
      action: 'query',
      list: 'allpages',
      apprefix: prefix,
      aplimit: '500',
      apnamespace: '0',
      apfilterredir: 'nonredirects',
    });
    if (cursor) params.set('apcontinue', cursor);

    const body = JSON.parse(
      await fetchText(`https://en.wikipedia.org/w/api.php?${params}`, 'application/json'),
    );
    titles.push(...(body.query?.allpages ?? []).map((page) => page.title));
    cursor = body.continue?.apcontinue;
    await delay(DELAY_MS);
  } while (cursor);

  return titles.filter((title) => !NOT_A_MODEL.test(title) && title !== prefix).sort();
}

async function electronics() {
  const out = {};

  for (const [category, brands] of Object.entries(WIKI_BRANDS)) {
    out[category] = {};
    for (const [value, prefix] of brands) {
      try {
        out[category][value] = await wikipediaModels(prefix);
        console.error(`  ${category}/${value}`.padEnd(24) + ` ${out[category][value].length} models`);
      } catch (error) {
        console.error(`  ! ${category}/${value}: ${error.message}`);
        out[category][value] = [];
      }
    }
  }

  return out;
}

// ------------------------------------------------------------------ phones

/**
 * Phone brands, as GSMArena slugs.
 *
 * Wikipedia was the first attempt and is the wrong shape for this: it indexes what someone
 * wrote an article about, so Motorola returned 1126 titles going back to pagers while
 * Nothing returned six. GSMArena is a device catalogue, so a brand's list is the brand's
 * devices, in release order, and its `robots.txt` permits these pages.
 */
const PHONE_BRANDS = [
  ['SAMSUNG', 'samsung-phones-9'],
  ['APPLE', 'apple-phones-48'],
  ['XIAOMI', 'xiaomi-phones-80'],
  ['REALME', 'realme-phones-118'],
  ['ONEPLUS', 'oneplus-phones-95'],
  ['VIVO', 'vivo-phones-98'],
  ['OPPO', 'oppo-phones-82'],
  ['MOTOROLA', 'motorola-phones-4'],
  ['NOKIA', 'nokia-phones-1'],
  ['GOOGLE', 'google-phones-107'],
  ['NOTHING', 'nothing-phones-128'],
  ['INFINIX', 'infinix-phones-119'],
  ['TECNO', 'tecno-phones-120'],
  ['POCO', 'poco-phones-127'],
  ['HONOR', 'honor-phones-121'],
  ['ASUS', 'asus-phones-46'],
  ['LAVA', 'lava-phones-94'],
  ['MICROMAX', 'micromax-phones-66'],
];

/** Devices on one catalogue page. */
function parseDevices(html) {
  const start = html.indexOf('makers');
  const body = start > -1 ? html.slice(start) : html;
  return [...body.matchAll(/<a href="[a-z0-9_.-]+\.php"><img[^>]*><strong><span>([\s\S]{2,60}?)<\/span>/gi)].map(
    (match) => match[1].replace(/<br\s*\/?>/g, ' ').replace(/\s+/g, ' ').trim(),
  );
}

async function phoneModels() {
  const byBrand = {};

  for (const [value, slug] of PHONE_BRANDS) {
    const found = new Set();
    let page = `https://www.gsmarena.com/${slug}.php`;
    let guard = 0;

    // Follow the brand's own pagination rather than guessing page numbers. Capped because a
    // parser that loses the "next" link would otherwise walk forever.
    while (page && guard < 40) {
      try {
        const html = await fetchText(page);
        parseDevices(html).forEach((name) => found.add(name));

        const next = [...html.matchAll(/href="([a-z0-9-]+-f-\d+-0-p(\d+)\.php)"/gi)]
          .map((match) => ({ href: match[1], n: Number(match[2]) }))
          .filter((link) => link.n === guard + 2)[0];
        page = next ? `https://www.gsmarena.com/${next.href}` : null;
      } catch (error) {
        console.error(`  ! ${value}: ${error.message}`);
        page = null;
      }
      guard += 1;
      await delay(DELAY_MS);
    }

    byBrand[value] = [...found].sort();
    console.error(`  ${value.padEnd(12)} ${byBrand[value].length} models`);
  }

  return byBrand;
}

// -------------------------------------------------------------------- main

async function main() {
  console.error('Vehicles — CarDekho');
  const vehicles = await carModels();

  console.error('\nPhones - GSMArena');
  const mobile = await phoneModels();

  console.error('\nCameras and laptops - Wikipedia');
  const gadgets = await electronics();
  gadgets.MOBILE = mobile;

  const result = {
    // Stamped by the caller, not in here: this file is data, and a timestamp it writes
    // itself makes every run look like a change even when nothing changed.
    sources: {
      vehicles: 'cardekho.com (robots.txt permits these paths)',
      electronics: 'en.wikipedia.org via the MediaWiki API, CC BY-SA',
    },
    vehicles,
    ...gadgets,
  };

  // A run where everything failed must not overwrite a good file with an empty one. The
  // first run did exactly that: every request threw, and it still wrote the result out.
  const total =
    Object.values(vehicles).flat().length +
    Object.values(gadgets).flatMap((brands) => Object.values(brands).flat()).length;
  if (total === 0) {
    throw new Error('Every source failed — refusing to write an empty taxonomy over a good one');
  }
  console.error(`
${total} model names collected`);

  // Merge over whatever is already on disk instead of replacing it.
  //
  // A rate-limited run collects some brands and not others. Overwriting would mean each run
  // throws away what the last one managed, and a full set would only ever appear if one run
  // happened to get everything. Topping up converges instead.
  const outIndex0 = process.argv.indexOf('--out');
  const target = outIndex0 > -1 ? process.argv[outIndex0 + 1] : null;
  if (target && existsSync(target)) {
    const previous = JSON.parse(readFileSync(target, 'utf8'));
    for (const [section, brands] of Object.entries(previous)) {
      if (section === 'sources' || typeof brands !== 'object') continue;
      result[section] ??= {};
      for (const [brand, models] of Object.entries(brands)) {
        if (!Array.isArray(models)) continue;
        const merged = new Set([...(result[section][brand] ?? []), ...models]);
        result[section][brand] = [...merged].sort();
      }
    }
  }

  const json = JSON.stringify(result, null, 2);
  const outIndex = process.argv.indexOf('--out');
  if (outIndex > -1 && process.argv[outIndex + 1]) {
    writeFileSync(process.argv[outIndex + 1], json + '\n');
    console.error(`\nWritten to ${process.argv[outIndex + 1]}`);
  } else {
    process.stdout.write(json + '\n');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
